-- Subscriptions, option 1: groups pay NkapBook by mobile money; the platform admin confirms each payment.
-- (This is the group paying for the service. NkapBook still never holds group money.)

alter table public.groups add column paid_until date;

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id),
  months smallint not null check (months between 1 and 24),
  amount bigint not null check (amount > 0),
  method public.pay_method not null,
  reference text check (char_length(reference) <= 64),
  note text check (char_length(note) <= 500),
  paid_until_before date,
  paid_until_after date not null,
  recorded_by uuid references auth.users (id),
  recorded_at timestamptz not null default now()
);
create index subscription_payments_group on public.subscription_payments (group_id, recorded_at desc);

alter table public.subscription_payments enable row level security;
revoke all on public.subscription_payments from anon, authenticated;
grant select on public.subscription_payments to authenticated;
-- officials see their own group's payments; the platform admin sees all
create policy subscription_payments_read on public.subscription_payments for select to authenticated
  using (private.can_read_group(group_id));
-- never edited or deleted
create trigger subscription_payments_no_update before update or delete on public.subscription_payments
  for each row execute function private.ledger_immutable();

-- paid_until changes only through the admin function below
create or replace function private.groups_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then return new; end if;
  if new.plan <> old.plan and not private.is_platform_admin() then
    raise exception 'only the platform admin can change the plan';
  end if;
  if new.paid_until is distinct from old.paid_until and not private.is_platform_admin() then
    raise exception 'only the platform admin can change the subscription';
  end if;
  if new.created_by is distinct from old.created_by then raise exception 'created_by is fixed'; end if;
  return new;
end;
$$;

-- Record a subscription payment: extends from the later of today or the current end date.
create or replace function public.admin_record_subscription(
  p_group uuid, p_months int, p_amount bigint, p_method public.pay_method, p_reference text default null, p_note text default null
) returns date language plpgsql security definer set search_path = ''
as $$
declare
  g public.groups;
  today date := (now() at time zone 'Africa/Douala')::date;
  new_end date;
begin
  if not private.is_platform_admin() then raise exception 'not allowed'; end if;
  select * into g from public.groups where id = p_group for update;
  if g.id is null then raise exception 'group not found'; end if;
  new_end := (greatest(coalesce(g.paid_until, today), today) + make_interval(months => p_months))::date;
  insert into public.subscription_payments (group_id, months, amount, method, reference, note, paid_until_before, paid_until_after, recorded_by)
  values (p_group, p_months, p_amount, p_method, nullif(trim(p_reference), ''), nullif(trim(p_note), ''), g.paid_until, new_end, auth.uid());
  update public.groups set paid_until = new_end, plan = 'paid' where id = p_group;
  return new_end;
end;
$$;
revoke all on function public.admin_record_subscription from public, anon;
grant execute on function public.admin_record_subscription to authenticated;

-- The admin overview also shows the plan's end date.
drop function public.admin_overview();
create or replace function public.admin_overview()
returns table (id uuid, name text, town text, plan public.group_plan, status public.group_status, language public.lang,
               created_at timestamptz, members bigint, meetings bigint, last_activity timestamptz, paid_until date)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'not allowed'; end if;
  return query
    select g.id, g.name, g.town, g.plan, g.status, g.language, g.created_at,
      (select count(*) from public.members m where m.group_id = g.id and m.status = 'active'),
      (select count(*) from public.meetings mt where mt.group_id = g.id),
      (select max(l.recorded_at) from public.ledger_entries l where l.group_id = g.id),
      g.paid_until
    from public.groups g
    order by g.created_at desc;
end;
$$;
revoke all on function public.admin_overview from public, anon;
grant execute on function public.admin_overview to authenticated;
