-- NkapBook foundation schema
-- Core rule: NkapBook records payments. It never collects, holds or moves money.
-- Money is stored in whole FCFA (bigint). Every table has Row Level Security.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Internal helpers live in `private`, which is not exposed through the API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.lang as enum ('en', 'fr', 'pcm');
create type public.meeting_frequency as enum ('weekly', 'biweekly', 'monthly');
create type public.group_status as enum ('active', 'paused', 'closed');
create type public.group_plan as enum ('pilot', 'free', 'paid');
create type public.member_role as enum ('president', 'secretary', 'treasurer', 'member');
create type public.member_status as enum ('active', 'left');
create type public.cycle_status as enum ('draft', 'active', 'completed');
create type public.order_method as enum ('manual', 'draw');
create type public.meeting_status as enum ('planned', 'open', 'closed');
create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');
create type public.ledger_account as enum ('njangi', 'fund', 'social');
create type public.ledger_kind as enum (
  'contribution_due', 'contribution_paid', 'payout',
  'fine_charged', 'fine_paid',
  'loan_disbursed', 'loan_interest', 'loan_repaid',
  'event_due', 'event_paid', 'event_payout',
  'fund_deposit', 'fund_withdrawal'
);
create type public.pay_method as enum ('cash', 'mtn_momo', 'orange_money', 'bank', 'other');
create type public.fine_type as enum ('late_payment', 'absence', 'lateness', 'misconduct', 'custom');
create type public.interest_basis as enum ('per_month', 'flat');
create type public.loan_status as enum ('active', 'repaid', 'defaulted');
create type public.event_kind as enum ('death', 'birth', 'wedding', 'other');
create type public.reminder_channel as enum ('wa_link', 'wa_cloud');

-- Cameroon numbers: 237 followed by 9 digits starting with 6 (mobile) or 2 (fixed).
create domain public.cm_phone as text
  check (value ~ '^237[26][0-9]{8}$');

-- ---------------------------------------------------------------------------
-- People and groups
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  display_name text check (char_length(display_name) <= 80),
  preferred_lang public.lang,
  created_at timestamptz not null default now()
);

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  town text check (char_length(town) <= 80),
  language public.lang not null default 'en',
  currency text not null default 'XAF' check (currency = 'XAF'),
  frequency public.meeting_frequency not null default 'monthly',
  -- weekly / biweekly: 0 (Sunday) .. 6 (Saturday). monthly: day of month 1..28.
  meeting_day smallint not null default 0,
  contribution_per_hand bigint not null check (contribution_per_hand > 0),
  start_date date not null default current_date,
  status public.group_status not null default 'active',
  plan public.group_plan not null default 'pilot',
  fines_go_to_fund boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint meeting_day_valid check (
    (frequency in ('weekly', 'biweekly') and meeting_day between 0 and 6)
    or (frequency = 'monthly' and meeting_day between 1 and 28)
  )
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  name text not null check (char_length(name) between 1 and 80),
  phone public.cm_phone,
  role public.member_role not null default 'member',
  hands smallint not null default 1 check (hands between 1 and 10),
  status public.member_status not null default 'active',
  left_at date,
  user_id uuid references auth.users (id),
  whatsapp_opt_in boolean not null default false,
  opt_in_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, id),
  unique (group_id, user_id)
);
create index members_user_idx on public.members (user_id) where user_id is not null;

create table public.member_links (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  member_id uuid not null,
  token text not null unique check (char_length(token) >= 40),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  revoked_at timestamptz,
  foreign key (group_id, member_id) references public.members (group_id, id)
);
-- At most one live link per member.
create unique index member_links_one_active on public.member_links (member_id) where revoked_at is null;

create table public.official_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  member_id uuid,
  phone public.cm_phone not null,
  role public.member_role not null check (role <> 'member'),
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id),
  foreign key (group_id, member_id) references public.members (group_id, id)
);
create unique index official_invites_open on public.official_invites (group_id, phone) where accepted_at is null;

-- ---------------------------------------------------------------------------
-- Cycles and meetings
-- ---------------------------------------------------------------------------
create table public.cycles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  number int not null check (number > 0),
  status public.cycle_status not null default 'draft',
  order_method public.order_method not null default 'manual',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (group_id, id),
  unique (group_id, number)
);

-- Every random draw is kept. A redraw is a new row, visible to everyone.
create table public.cycle_draws (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  cycle_id uuid not null,
  seed text not null,
  result jsonb not null,
  drawn_by uuid references auth.users (id),
  drawn_at timestamptz not null default now(),
  witness_note text check (char_length(witness_note) <= 500),
  foreign key (group_id, cycle_id) references public.cycles (group_id, id)
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  cycle_id uuid,
  date date not null,
  status public.meeting_status not null default 'planned',
  minutes text check (char_length(minutes) <= 20000),
  opened_at timestamptz,
  closed_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (group_id, id),
  foreign key (group_id, cycle_id) references public.cycles (group_id, id)
);
create index meetings_group_date on public.meetings (group_id, date);

create table public.cycle_slots (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  cycle_id uuid not null,
  position int not null check (position > 0),
  member_id uuid not null,
  hand_no smallint not null default 1 check (hand_no >= 1),
  planned_date date,
  meeting_id uuid,
  foreign key (group_id, cycle_id) references public.cycles (group_id, id),
  foreign key (group_id, member_id) references public.members (group_id, id),
  foreign key (group_id, meeting_id) references public.meetings (group_id, id),
  unique (cycle_id, position),
  unique (cycle_id, member_id, hand_no)
);

create table public.attendance (
  -- client-generated id so offline marks are idempotent
  id uuid primary key,
  group_id uuid not null,
  meeting_id uuid not null,
  member_id uuid not null,
  status public.attendance_status not null,
  recorded_by uuid references auth.users (id),
  recorded_at timestamptz not null default now(),
  foreign key (group_id, meeting_id) references public.meetings (group_id, id),
  foreign key (group_id, member_id) references public.members (group_id, id),
  unique (meeting_id, member_id)
);

-- ---------------------------------------------------------------------------
-- Fines, loans, events (terms only; all amounts live in the ledger)
-- ---------------------------------------------------------------------------
create table public.fine_rules (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  type public.fine_type not null,
  label text check (char_length(label) <= 80),
  amount bigint not null check (amount > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id, id)
);

create table public.fines (
  id uuid primary key,
  group_id uuid not null,
  member_id uuid not null,
  meeting_id uuid,
  type public.fine_type not null,
  rule_id uuid,
  note text check (char_length(note) <= 500),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (group_id, id),
  foreign key (group_id, member_id) references public.members (group_id, id),
  foreign key (group_id, meeting_id) references public.meetings (group_id, id),
  foreign key (group_id, rule_id) references public.fine_rules (group_id, id)
);

create table public.loans (
  id uuid primary key,
  group_id uuid not null,
  member_id uuid not null,
  principal bigint not null check (principal > 0),
  interest_rate_pct numeric(5, 2) not null default 0 check (interest_rate_pct between 0 and 100),
  interest_basis public.interest_basis not null default 'per_month',
  start_date date not null default current_date,
  due_date date not null,
  status public.loan_status not null default 'active',
  note text check (char_length(note) <= 500),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (group_id, id),
  foreign key (group_id, member_id) references public.members (group_id, id),
  check (due_date >= start_date)
);

create table public.loan_guarantors (
  group_id uuid not null,
  loan_id uuid not null,
  member_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (loan_id, member_id),
  foreign key (group_id, loan_id) references public.loans (group_id, id),
  foreign key (group_id, member_id) references public.members (group_id, id)
);

create table public.social_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  title text not null check (char_length(title) between 1 and 120),
  kind public.event_kind not null default 'other',
  default_amount bigint not null check (default_amount > 0),
  due_date date,
  for_member_id uuid,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (group_id, id),
  foreign key (group_id, for_member_id) references public.members (group_id, id)
);

-- ---------------------------------------------------------------------------
-- The ledger: append-only. Corrections = reversing entry + new entry.
-- ---------------------------------------------------------------------------
create table public.ledger_entries (
  id uuid primary key, -- generated on the phone, so offline sync never doubles
  group_id uuid not null references public.groups (id),
  member_id uuid,
  meeting_id uuid,
  account public.ledger_account not null default 'njangi',
  kind public.ledger_kind not null,
  amount bigint not null check (amount > 0),
  method public.pay_method,
  momo_ref text check (char_length(momo_ref) <= 64),
  fine_id uuid,
  loan_id uuid,
  event_id uuid,
  note text check (char_length(note) <= 500),
  reverses_entry_id uuid unique references public.ledger_entries (id),
  reason text check (char_length(reason) <= 500),
  recorded_by uuid references auth.users (id),
  recorded_at timestamptz not null default now(),
  client_recorded_at timestamptz,
  foreign key (group_id, member_id) references public.members (group_id, id),
  foreign key (group_id, meeting_id) references public.meetings (group_id, id),
  foreign key (group_id, fine_id) references public.fines (group_id, id),
  foreign key (group_id, loan_id) references public.loans (group_id, id),
  foreign key (group_id, event_id) references public.social_events (group_id, id),
  constraint reversal_needs_reason check (reverses_entry_id is null or char_length(coalesce(reason, '')) >= 3),
  constraint member_required check (kind in ('fund_deposit', 'fund_withdrawal') or member_id is not null)
);
create index ledger_group_member on public.ledger_entries (group_id, member_id);
create index ledger_group_meeting on public.ledger_entries (group_id, meeting_id);

create table public.payout_confirmations (
  payout_entry_id uuid primary key references public.ledger_entries (id),
  group_id uuid not null references public.groups (id),
  member_id uuid not null,
  confirmed_at timestamptz not null default now(),
  via text not null default 'member_link',
  foreign key (group_id, member_id) references public.members (group_id, id)
);

-- ---------------------------------------------------------------------------
-- Audit log, reminders, rate limits
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  group_id uuid,
  table_name text not null,
  row_id text,
  action text not null,
  old_row jsonb,
  new_row jsonb,
  actor uuid,
  at timestamptz not null default now()
);
create index audit_log_group on public.audit_log (group_id, at desc);

create table public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null,
  member_id uuid not null,
  meeting_id uuid,
  channel public.reminder_channel not null,
  sent_by uuid references auth.users (id),
  sent_at timestamptz not null default now(),
  foreign key (group_id, member_id) references public.members (group_id, id),
  foreign key (group_id, meeting_id) references public.meetings (group_id, id)
);

create table private.rate_limits (
  bucket text not null,
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (bucket, key, window_start)
);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.platform_admins where user_id = auth.uid()) $$;

create or replace function private.is_group_official(gid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.group_id = gid and m.user_id = auth.uid()
      and m.role <> 'member' and m.status = 'active'
  )
$$;

create or replace function private.is_group_president(gid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.group_id = gid and m.user_id = auth.uid()
      and m.role = 'president' and m.status = 'active'
  )
$$;

create or replace function private.can_read_group(gid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.is_group_official(gid) or private.is_platform_admin() $$;

grant execute on function private.is_platform_admin(), private.is_group_official(uuid),
  private.is_group_president(uuid), private.can_read_group(uuid) to authenticated, service_role;

-- Fixed-window rate limiter. Returns true when the call is allowed.
create or replace function private.hit_rate_limit(p_bucket text, p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  n int;
begin
  insert into private.rate_limits as r (bucket, key, window_start, count)
  values (p_bucket, p_key, w, 1)
  on conflict (bucket, key, window_start) do update set count = r.count + 1
  returning count into n;
  -- opportunistic cleanup of old windows
  if random() < 0.01 then
    delete from private.rate_limits where window_start < now() - interval '1 day';
  end if;
  return n <= p_max;
end;
$$;
revoke all on function private.hit_rate_limit(text, text, int, int) from public;
grant execute on function private.hit_rate_limit(text, text, int, int) to service_role;

-- Exposed to the server (service role) so the OTP route can rate-limit by phone and IP.
create or replace function public.check_rate_limit(p_bucket text, p_key text, p_max int, p_window_seconds int)
returns boolean language sql security definer set search_path = ''
as $$ select private.hit_rate_limit(p_bucket, p_key, p_max, p_window_seconds) $$;
revoke all on function public.check_rate_limit(text, text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, text, int, int) to service_role;

-- 32 random bytes, URL-safe base64 (43 chars).
create or replace function private.new_link_token()
returns text language sql volatile set search_path = ''
as $$ select rtrim(translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/', '-_'), '=') $$;

-- ---------------------------------------------------------------------------
-- Profiles from auth users
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (user_id, phone) values (new.id, new.phone)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- Ledger rows can never be changed or removed, not even by officials.
create or replace function private.ledger_immutable()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'ledger entries cannot be edited or deleted; record a correction instead'
    using errcode = 'P0001';
end;
$$;
create trigger ledger_no_update before update or delete on public.ledger_entries
  for each row execute function private.ledger_immutable();
create trigger payout_conf_no_update before update or delete on public.payout_confirmations
  for each row execute function private.ledger_immutable();
create trigger audit_no_update before update or delete on public.audit_log
  for each row execute function private.ledger_immutable();
create trigger draws_no_update before update or delete on public.cycle_draws
  for each row execute function private.ledger_immutable();

-- A reversal must mirror the original exactly.
create or replace function private.ledger_check_reversal()
returns trigger language plpgsql set search_path = ''
as $$
declare o public.ledger_entries;
begin
  new.recorded_at := now();
  if new.reverses_entry_id is not null then
    select * into o from public.ledger_entries where id = new.reverses_entry_id;
    if o.id is null then raise exception 'original entry not found'; end if;
    if o.reverses_entry_id is not null then raise exception 'cannot reverse a reversal'; end if;
    if o.group_id <> new.group_id or o.kind <> new.kind or o.amount <> new.amount
       or o.member_id is distinct from new.member_id or o.account <> new.account then
      raise exception 'reversal must match the original entry';
    end if;
  end if;
  return new;
end;
$$;
create trigger ledger_reversal before insert on public.ledger_entries
  for each row execute function private.ledger_check_reversal();

-- Officials may manage members, but only the president changes official roles
-- or links logins. Plan changes are reserved for the platform admin.
create or replace function private.members_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
  if tg_op = 'INSERT' then
    if new.user_id is not null then raise exception 'logins are linked through invites'; end if;
    if new.role <> 'member' and not private.is_group_president(new.group_id) then
      raise exception 'only the president can assign official roles';
    end if;
  else
    if new.group_id <> old.group_id then raise exception 'cannot move a member between groups'; end if;
    if new.user_id is distinct from old.user_id then raise exception 'logins are linked through invites'; end if;
    if new.role <> old.role and not private.is_group_president(new.group_id) then
      raise exception 'only the president can change roles';
    end if;
  end if;
  if new.whatsapp_opt_in and (tg_op = 'INSERT' or not old.whatsapp_opt_in) then
    new.opt_in_at := now();
  end if;
  return new;
end;
$$;
create trigger members_guard before insert or update on public.members
  for each row execute function private.members_guard();

create or replace function private.groups_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
  if new.plan <> old.plan and not private.is_platform_admin() then
    raise exception 'only the platform admin can change the plan';
  end if;
  if new.created_by is distinct from old.created_by then raise exception 'created_by is fixed'; end if;
  return new;
end;
$$;
create trigger groups_guard before update on public.groups
  for each row execute function private.groups_guard();

-- Generic audit trail for everything that is not the ledger.
create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  o jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  gid uuid;
begin
  gid := coalesce((n ->> 'group_id')::uuid, (o ->> 'group_id')::uuid);
  if tg_table_name = 'groups' then gid := coalesce((n ->> 'id')::uuid, (o ->> 'id')::uuid); end if;
  -- never copy link tokens into the audit log
  if tg_table_name = 'member_links' then o := o - 'token'; n := n - 'token'; end if;
  insert into public.audit_log (group_id, table_name, row_id, action, old_row, new_row, actor)
  values (gid, tg_table_name, coalesce(n ->> 'id', o ->> 'id', n ->> 'loan_id'), lower(tg_op), o, n, auth.uid());
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['groups', 'members', 'member_links', 'official_invites', 'cycles',
    'cycle_slots', 'meetings', 'attendance', 'fine_rules', 'fines', 'loans', 'loan_guarantors',
    'social_events']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
      for each row execute function private.audit_row()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles', 'platform_admins', 'groups', 'members', 'member_links',
    'official_invites', 'cycles', 'cycle_draws', 'meetings', 'cycle_slots', 'attendance',
    'fine_rules', 'fines', 'loans', 'loan_guarantors', 'social_events', 'ledger_entries',
    'payout_confirmations', 'audit_log', 'reminder_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    -- the browser's anonymous role never touches tables directly
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
alter table private.rate_limits enable row level security;

-- profiles: your own only
create policy profiles_self_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- platform_admins: you can see whether you are one
create policy admins_self on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));

-- groups
create policy groups_read on public.groups for select to authenticated
  using (private.can_read_group(id));
create policy groups_update on public.groups for update to authenticated
  using (private.is_group_official(id) or private.is_platform_admin())
  with check (private.is_group_official(id) or private.is_platform_admin());
-- groups are created through public.create_group()

-- Standard pattern for group-scoped tables: officials read and write their group,
-- the platform admin can read. No deletes anywhere (status fields instead).
do $$
declare t text;
begin
  foreach t in array array['members', 'cycles', 'meetings', 'cycle_slots', 'attendance',
    'fine_rules', 'fines', 'loans', 'social_events', 'reminder_log']
  loop
    execute format('create policy %1$s_read on public.%1$I for select to authenticated
      using (private.can_read_group(group_id))', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated
      with check (private.is_group_official(group_id))', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated
      using (private.is_group_official(group_id)) with check (private.is_group_official(group_id))', t);
  end loop;
end $$;

-- loan guarantors can be removed before the loan is settled (audited)
create policy loan_guarantors_read on public.loan_guarantors for select to authenticated
  using (private.can_read_group(group_id));
create policy loan_guarantors_insert on public.loan_guarantors for insert to authenticated
  with check (private.is_group_official(group_id));
create policy loan_guarantors_delete on public.loan_guarantors for delete to authenticated
  using (private.is_group_official(group_id));

-- member links: officials read (to resend on WhatsApp); created/reset via functions
create policy member_links_read on public.member_links for select to authenticated
  using (private.is_group_official(group_id));

-- invites: officials read, president creates
create policy invites_read on public.official_invites for select to authenticated
  using (private.can_read_group(group_id));
create policy invites_insert on public.official_invites for insert to authenticated
  with check (private.is_group_president(group_id) and invited_by = (select auth.uid()));

-- draws: read only; created through the draw function
create policy draws_read on public.cycle_draws for select to authenticated
  using (private.can_read_group(group_id));

-- ledger: officials append, everyone with access reads; nobody updates or deletes
create policy ledger_read on public.ledger_entries for select to authenticated
  using (private.can_read_group(group_id));
create policy ledger_insert on public.ledger_entries for insert to authenticated
  with check (private.is_group_official(group_id) and recorded_by = (select auth.uid()));

create policy payout_conf_read on public.payout_confirmations for select to authenticated
  using (private.can_read_group(group_id));

create policy audit_read on public.audit_log for select to authenticated
  using (group_id is not null and private.can_read_group(group_id));

-- ---------------------------------------------------------------------------
-- RPCs for actions that need more than a single-row policy
-- ---------------------------------------------------------------------------

-- Create a group and make the caller its president.
create or replace function public.create_group(
  p_name text, p_town text, p_language public.lang, p_frequency public.meeting_frequency,
  p_meeting_day smallint, p_contribution_per_hand bigint, p_start_date date, p_president_name text
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  gid uuid;
  ph text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select phone into ph from auth.users where id = uid;
  insert into public.groups (name, town, language, frequency, meeting_day, contribution_per_hand, start_date, created_by)
  values (p_name, p_town, p_language, p_frequency, p_meeting_day, p_contribution_per_hand, coalesce(p_start_date, current_date), uid)
  returning id into gid;
  insert into public.members (group_id, name, phone, role, user_id)
  values (gid, p_president_name, case when ph ~ '^237[26][0-9]{8}$' then ph end, 'president', uid);
  return gid;
end;
$$;
revoke all on function public.create_group from public, anon;
grant execute on function public.create_group to authenticated;

-- After sign-in: accept any open invites for the caller's phone number.
create or replace function public.accept_invites()
returns int language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  ph text;
  inv record;
  mid uuid;
  n int := 0;
begin
  if uid is null then return 0; end if;
  select phone into ph from auth.users where id = uid;
  if ph is null then return 0; end if;
  for inv in select * from public.official_invites where phone = ph and accepted_at is null loop
    -- already linked to this group? just update the role
    select id into mid from public.members where group_id = inv.group_id and user_id = uid;
    if mid is null then
      mid := inv.member_id;
      if mid is null then
        select id into mid from public.members
        where group_id = inv.group_id and phone = ph and user_id is null limit 1;
      end if;
      if mid is null then
        insert into public.members (group_id, name, phone, role)
        values (inv.group_id, 'Official ' || right(ph, 4), ph, inv.role) returning id into mid;
      end if;
    end if;
    update public.members set user_id = uid, role = inv.role, status = 'active' where id = mid;
    update public.official_invites set accepted_at = now(), accepted_by = uid, member_id = mid where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.accept_invites from public, anon;
grant execute on function public.accept_invites to authenticated;

-- Create or reset a member's private link. Any official can do this.
create or replace function public.reset_member_link(p_member_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  gid uuid;
  tok text := private.new_link_token();
begin
  select group_id into gid from public.members where id = p_member_id;
  if gid is null or not private.is_group_official(gid) then raise exception 'not allowed'; end if;
  update public.member_links set revoked_at = now() where member_id = p_member_id and revoked_at is null;
  insert into public.member_links (group_id, member_id, token, created_by) values (gid, p_member_id, tok, auth.uid());
  return tok;
end;
$$;
revoke all on function public.reset_member_link from public, anon;
grant execute on function public.reset_member_link to authenticated;

-- Platform admin: switch a group's plan.
create or replace function public.admin_set_plan(p_group_id uuid, p_plan public.group_plan)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'not allowed'; end if;
  update public.groups set plan = p_plan where id = p_group_id;
end;
$$;
revoke all on function public.admin_set_plan from public, anon;
grant execute on function public.admin_set_plan to authenticated;

-- Table privileges. Supabase grants ALL (including TRUNCATE, which skips RLS and
-- row triggers) to anon and authenticated by default, so start from nothing.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, public;
-- Signed-in users: RLS still decides which rows.
grant select, insert, update on all tables in schema public to authenticated;
grant delete on public.loan_guarantors to authenticated;
revoke insert, update on public.ledger_entries from authenticated;
grant insert on public.ledger_entries to authenticated;
revoke insert, update on public.audit_log, public.payout_confirmations, public.cycle_draws,
  public.member_links, public.platform_admins from authenticated;
revoke insert on public.profiles from authenticated;
