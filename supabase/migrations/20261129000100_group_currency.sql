-- Groups can keep their records in their own currency (diaspora groups: baht, pounds, euros...).
-- Amounts stay whole numbers. The currency can only change before any money is recorded, so old
-- records never silently change meaning. NkapBook's own subscription stays in FCFA.

alter table public.groups drop constraint if exists groups_currency_check;
alter table public.groups add constraint groups_currency_check
  check (currency in ('XAF', 'XOF', 'NGN', 'GHS', 'KES', 'ZAR', 'THB', 'EUR', 'GBP', 'USD', 'CAD'));

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
  if new.currency <> old.currency and exists (select 1 from public.ledger_entries e where e.group_id = old.id) then
    raise exception 'currency_locked: the currency can''t change once money has been recorded';
  end if;
  return new;
end;
$$;

-- create_group gains a currency (default FCFA). Replace the old 8-argument version.
drop function public.create_group(text, text, public.lang, public.meeting_frequency, smallint, bigint, date, text);
create or replace function public.create_group(
  p_name text, p_town text, p_language public.lang, p_frequency public.meeting_frequency,
  p_meeting_day smallint, p_contribution_per_hand bigint, p_start_date date, p_president_name text,
  p_currency text default 'XAF'
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  gid uuid;
  ph text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select phone into ph from auth.users where id = uid;
  insert into public.groups (name, town, language, frequency, meeting_day, contribution_per_hand, start_date, created_by, plan, paid_until, currency)
  values (p_name, p_town, p_language, p_frequency, p_meeting_day, p_contribution_per_hand, coalesce(p_start_date, current_date), uid,
          'trial', (now() at time zone 'Africa/Douala')::date + 60, coalesce(p_currency, 'XAF'))
  returning id into gid;
  insert into public.members (group_id, name, phone, role, user_id)
  values (gid, p_president_name,
          case when ph ~ '^[1-9][0-9]{7,14}$' and (ph !~ '^237' or ph ~ '^237[26][0-9]{8}$') then ph end,
          'president', uid);
  return gid;
end;
$$;
revoke all on function public.create_group(text, text, public.lang, public.meeting_frequency, smallint, bigint, date, text, text) from public, anon;
grant execute on function public.create_group(text, text, public.lang, public.meeting_frequency, smallint, bigint, date, text, text) to authenticated;

-- The member's private link shows amounts in the group's currency.
create or replace function public.member_view(p_token text, p_ip text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  l public.member_links;
  mem public.members;
  g public.groups;
  cyc uuid;
  res jsonb;
begin
  if not private.hit_rate_limit('link_ip', coalesce(p_ip, '?'), 120, 600) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{40,64}$' then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not private.hit_rate_limit('link_token', p_token, 300, 3600) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  l := private.link_member(p_token);
  if l.id is null then return jsonb_build_object('status', 'not_found'); end if;
  if l.revoked_at is not null then return jsonb_build_object('status', 'revoked'); end if;

  update public.member_links set last_opened_at = now() where id = l.id;
  select * into mem from public.members where id = l.member_id;
  select * into g from public.groups where id = mem.group_id;
  select id into cyc from public.cycles where group_id = g.id and status in ('active', 'draft') order by status limit 1;

  with le as (
    select e.*, case when e.reverses_entry_id is null then e.amount else -e.amount end as net,
           coalesce(mt.date, (e.recorded_at at time zone 'Africa/Douala')::date) as on_date
    from public.ledger_entries e left join public.meetings mt on mt.id = e.meeting_id
    where e.member_id = mem.id
  ),
  t as (
    select
      coalesce(sum(net) filter (where kind = 'contribution_paid'), 0) as paid,
      coalesce(sum(net) filter (where kind = 'contribution_due'), 0) as due,
      coalesce(sum(net) filter (where kind = 'fine_charged'), 0) as fines_charged,
      coalesce(sum(net) filter (where kind = 'fine_paid'), 0) as fines_paid,
      coalesce(sum(net) filter (where kind in ('loan_disbursed', 'loan_interest')), 0) as loan_owed,
      coalesce(sum(net) filter (where kind = 'loan_repaid'), 0) as loan_repaid,
      coalesce(sum(net) filter (where kind = 'event_due'), 0) as events_due,
      coalesce(sum(net) filter (where kind = 'event_paid'), 0) as events_paid,
      coalesce(sum(net) filter (where kind = 'payout'), 0) as received
    from le
  ),
  next_slot as (
    select s.planned_date, m.name
    from public.cycle_slots s join public.cycles c on c.id = s.cycle_id join public.members m on m.id = s.member_id
    where c.group_id = g.id and c.status = 'active' and s.meeting_id is null
    order by s.position limit 1
  )
  select jsonb_build_object(
    'status', 'ok',
    'member', jsonb_build_object('name', mem.name, 'hands', mem.hands, 'status', mem.status),
    'group', jsonb_build_object('name', g.name, 'town', g.town, 'language', g.language, 'currency', g.currency,
                                'contribution_per_hand', g.contribution_per_hand,
                                'frequency', g.frequency, 'meeting_day', g.meeting_day),
    'totals', (select jsonb_build_object(
        'paid', paid,
        'contribution_owing', greatest(due - paid, 0),
        'credit', greatest(paid - due, 0),
        'fines_owing', greatest(fines_charged - fines_paid, 0),
        'loans_owing', greatest(loan_owed - loan_repaid, 0),
        'events_owing', greatest(events_due - events_paid, 0),
        'received', received) from t),
    'next', (select jsonb_build_object('date', planned_date, 'collector', split_part(name, ' ', 1)) from next_slot),
    'turns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', s.position, 'hand_no', s.hand_no, 'planned_date', s.planned_date,
        'meeting_date', mt.date, 'cycle_status', c.status) order by s.position)
      from public.cycle_slots s join public.cycles c on c.id = s.cycle_id
      left join public.meetings mt on mt.id = s.meeting_id
      where s.member_id = mem.id and c.id = cyc), '[]'::jsonb),
    'payouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'amount', p.amount, 'method', p.method, 'date', p.on_date,
        'confirmed_at', pc.confirmed_at) order by p.on_date desc)
      from le p left join public.payout_confirmations pc on pc.payout_entry_id = p.id
      where p.kind = 'payout' and p.reverses_entry_id is null
        and not exists (select 1 from public.ledger_entries r where r.reverses_entry_id = p.id)), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(h order by h->>'at' desc) from (
        select jsonb_build_object(
          'id', e.id, 'kind', e.kind, 'amount', e.amount, 'method', e.method, 'date', e.on_date,
          'at', e.recorded_at, 'correction', e.reverses_entry_id is not null, 'reason', e.reason,
          'corrected', exists (select 1 from public.ledger_entries r where r.reverses_entry_id = e.id)) as h
        from le e order by e.recorded_at desc limit 60) x), '[]'::jsonb)
  ) into res;
  return res;
end;
$$;
