-- Phase 6: fines (manual and automatic), loans with guarantors, events, savings fund, dashboard views.

-- Each automatic rule fines a member at most once per meeting.
create unique index fines_rule_once on public.fines (meeting_id, member_id, rule_id) where rule_id is not null;

alter table public.loans add column term_months smallint;
alter table public.loans add column method public.pay_method;

-- Amounts live in the ledger; these rows only allow harmless edits.
revoke update on public.loans, public.fines, public.social_events from authenticated;
grant update (status, note) on public.loans to authenticated;
grant update (note) on public.fines to authenticated;
grant update (title, due_date) on public.social_events to authenticated;

-- ---------------------------------------------------------------------------
-- Views (security_invoker: Row Level Security of the caller applies)
-- ---------------------------------------------------------------------------
create view public.ledger_net with (security_invoker = true) as
select l.*, case when l.reverses_entry_id is null then l.amount else -l.amount end as net
from public.ledger_entries l;

create view public.member_balances with (security_invoker = true) as
select m.group_id, m.id as member_id, m.name, m.status, m.hands, m.phone,
  (coalesce(sum(l.net) filter (where l.kind = 'contribution_due'), 0)
    - coalesce(sum(l.net) filter (where l.kind = 'contribution_paid'), 0))::bigint as contribution_owing,
  (coalesce(sum(l.net) filter (where l.kind = 'fine_charged'), 0)
    - coalesce(sum(l.net) filter (where l.kind = 'fine_paid'), 0))::bigint as fines_owing,
  (coalesce(sum(l.net) filter (where l.kind in ('loan_disbursed', 'loan_interest')), 0)
    - coalesce(sum(l.net) filter (where l.kind = 'loan_repaid'), 0))::bigint as loans_owing,
  (coalesce(sum(l.net) filter (where l.kind = 'event_due'), 0)
    - coalesce(sum(l.net) filter (where l.kind = 'event_paid'), 0))::bigint as events_owing,
  (coalesce(sum(l.net) filter (where l.kind = 'contribution_paid'), 0))::bigint as contributions_paid,
  (coalesce(sum(l.net) filter (where l.kind = 'fund_deposit'), 0))::bigint as savings
from public.members m
left join public.ledger_net l on l.member_id = m.id
group by m.group_id, m.id;

create view public.loan_balances with (security_invoker = true) as
select lo.id, lo.group_id, lo.member_id, m.name as member_name, lo.principal, lo.interest_rate_pct,
  lo.interest_basis, lo.term_months, lo.start_date, lo.due_date, lo.status, lo.note, lo.created_at,
  (coalesce(sum(l.net) filter (where l.kind in ('loan_disbursed', 'loan_interest')), 0))::bigint as owed_total,
  (coalesce(sum(l.net) filter (where l.kind = 'loan_interest'), 0))::bigint as interest,
  (coalesce(sum(l.net) filter (where l.kind = 'loan_repaid'), 0))::bigint as repaid,
  (coalesce(sum(l.net) filter (where l.kind in ('loan_disbursed', 'loan_interest')), 0)
    - coalesce(sum(l.net) filter (where l.kind = 'loan_repaid'), 0))::bigint as balance,
  (lo.status = 'active' and lo.due_date < (now() at time zone 'Africa/Douala')::date
    and coalesce(sum(l.net) filter (where l.kind in ('loan_disbursed', 'loan_interest')), 0)
        - coalesce(sum(l.net) filter (where l.kind = 'loan_repaid'), 0) > 0) as overdue
from public.loans lo
join public.members m on m.id = lo.member_id
left join public.ledger_net l on l.loan_id = lo.id
group by lo.id, m.name;

create view public.fine_balances with (security_invoker = true) as
select f.id, f.group_id, f.member_id, m.name as member_name, f.meeting_id, f.type, f.rule_id, f.note, f.created_at,
  (coalesce(sum(l.net) filter (where l.kind = 'fine_charged'), 0))::bigint as charged,
  (coalesce(sum(l.net) filter (where l.kind = 'fine_paid'), 0))::bigint as paid,
  (coalesce(sum(l.net) filter (where l.kind = 'fine_charged'), 0)
    - coalesce(sum(l.net) filter (where l.kind = 'fine_paid'), 0))::bigint as balance,
  (select e.id from public.ledger_entries e where e.fine_id = f.id and e.kind = 'fine_charged'
     and e.reverses_entry_id is null order by e.recorded_at limit 1) as charge_entry_id
from public.fines f
join public.members m on m.id = f.member_id
left join public.ledger_net l on l.fine_id = f.id
group by f.id, m.name;

create view public.event_balances with (security_invoker = true) as
select e.id as event_id, e.group_id, l.member_id, m.name as member_name,
  (coalesce(sum(l.net) filter (where l.kind = 'event_due'), 0))::bigint as due,
  (coalesce(sum(l.net) filter (where l.kind = 'event_paid'), 0))::bigint as paid
from public.social_events e
join public.ledger_net l on l.event_id = e.id and l.kind in ('event_due', 'event_paid')
join public.members m on m.id = l.member_id
group by e.id, l.member_id, m.name;

-- Cash in each bucket, from the records. Interest and dues are promises, not cash, so they don't count.
create view public.group_accounts with (security_invoker = true) as
select g.id as group_id,
  (coalesce(sum(l.net) filter (where l.account = 'fund' and l.kind in ('fund_deposit', 'loan_repaid', 'fine_paid')), 0)
    - coalesce(sum(l.net) filter (where l.account = 'fund' and l.kind in ('loan_disbursed', 'fund_withdrawal')), 0))::bigint as fund_balance,
  (coalesce(sum(l.net) filter (where l.account = 'social' and l.kind = 'event_paid'), 0)
    - coalesce(sum(l.net) filter (where l.account = 'social' and l.kind = 'event_payout'), 0))::bigint as social_balance,
  (coalesce(sum(l.net) filter (where l.account = 'njangi' and l.kind in ('contribution_paid', 'fine_paid')), 0)
    - coalesce(sum(l.net) filter (where l.account = 'njangi' and l.kind = 'payout'), 0))::bigint as njangi_cash
from public.groups g
left join public.ledger_net l on l.group_id = g.id
group by g.id;

revoke all on public.ledger_net, public.member_balances, public.loan_balances, public.fine_balances,
  public.event_balances, public.group_accounts from anon, authenticated;
grant select on public.ledger_net, public.member_balances, public.loan_balances, public.fine_balances,
  public.event_balances, public.group_accounts to authenticated;

-- ---------------------------------------------------------------------------
-- Loan maths: "% per month" = simple interest on the amount borrowed, for each month of the term.
-- ---------------------------------------------------------------------------
create or replace function public.loan_term_months(p_start date, p_due date)
returns int language sql immutable set search_path = ''
as $$
  select greatest(1,
    (extract(year from age(p_due, p_start)) * 12 + extract(month from age(p_due, p_start)))::int
    + case when extract(day from age(p_due, p_start)) > 0 then 1 else 0 end)
$$;

create or replace function public.loan_interest_amount(p_principal bigint, p_rate numeric, p_basis public.interest_basis, p_months int)
returns bigint language sql immutable set search_path = ''
as $$
  select round(p_principal * p_rate / 100 * case when p_basis = 'per_month' then p_months else 1 end)::bigint
$$;
grant execute on function public.loan_term_months, public.loan_interest_amount to authenticated;

-- ---------------------------------------------------------------------------
-- Automatic fines for one meeting. Safe to run again: each rule fines a member once per meeting.
-- ---------------------------------------------------------------------------
create or replace function public.apply_fine_rules(p_meeting uuid)
returns int language plpgsql set search_path = ''
as $$
declare
  mt public.meetings;
  g public.groups;
  r public.fine_rules;
  n int := 0;
  k int;
begin
  select * into mt from public.meetings where id = p_meeting;
  if mt.id is null or not private.is_group_official(mt.group_id) then raise exception 'not allowed'; end if;
  select * into g from public.groups where id = mt.group_id;

  for r in select * from public.fine_rules
           where group_id = mt.group_id and active and type in ('late_payment', 'absence', 'lateness') loop
    with candidates as (
      select m.id as member_id from public.members m
      where m.group_id = mt.group_id and (
        (r.type = 'late_payment' and exists (
           select 1 from public.ledger_net l where l.member_id = m.id and l.meeting_id = mt.id and l.kind = 'contribution_due')
         and (select coalesce(sum(net) filter (where kind = 'contribution_due'), 0)
                   - coalesce(sum(net) filter (where kind = 'contribution_paid'), 0)
              from public.ledger_net l where l.member_id = m.id and l.meeting_id = mt.id) > 0)
        or (r.type = 'absence' and exists (select 1 from public.attendance a
              where a.meeting_id = mt.id and a.member_id = m.id and a.status = 'absent'))
        or (r.type = 'lateness' and exists (select 1 from public.attendance a
              where a.meeting_id = mt.id and a.member_id = m.id and a.status = 'late'))
      )
    ),
    ins as (
      insert into public.fines (id, group_id, member_id, meeting_id, type, rule_id, created_by)
      select gen_random_uuid(), mt.group_id, c.member_id, mt.id, r.type, r.id, auth.uid() from candidates c
      on conflict (meeting_id, member_id, rule_id) where rule_id is not null do nothing
      returning id, member_id
    )
    insert into public.ledger_entries (id, group_id, member_id, meeting_id, fine_id, account, kind, amount, recorded_by)
    select gen_random_uuid(), mt.group_id, ins.member_id, mt.id, ins.id,
           case when g.fines_go_to_fund then 'fund' else 'njangi' end::public.ledger_account,
           'fine_charged', r.amount, auth.uid()
    from ins;
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end;
$$;
revoke all on function public.apply_fine_rules from public, anon;
grant execute on function public.apply_fine_rules to authenticated;

-- ---------------------------------------------------------------------------
-- Events: one-off collections with an amount per member.
-- p_amounts: [{ "member_id": ..., "amount": 2000 }, ...]
-- ---------------------------------------------------------------------------
create or replace function public.create_event(
  p_id uuid, p_group uuid, p_title text, p_kind public.event_kind, p_default bigint,
  p_due date, p_for_member uuid, p_amounts jsonb
) returns uuid language plpgsql set search_path = ''
as $$
begin
  if not private.is_group_official(p_group) then raise exception 'not allowed'; end if;
  if exists (select 1 from public.social_events where id = p_id) then return p_id; end if;
  insert into public.social_events (id, group_id, title, kind, default_amount, due_date, for_member_id, created_by)
  values (p_id, p_group, p_title, p_kind, p_default, p_due, p_for_member, auth.uid());
  insert into public.ledger_entries (id, group_id, member_id, event_id, account, kind, amount, recorded_by)
  select gen_random_uuid(), p_group, (e ->> 'member_id')::uuid, p_id, 'social', 'event_due', (e ->> 'amount')::bigint, auth.uid()
  from jsonb_array_elements(coalesce(p_amounts, '[]'::jsonb)) e
  where (e ->> 'amount')::bigint > 0;
  return p_id;
end;
$$;
revoke all on function public.create_event from public, anon;
grant execute on function public.create_event to authenticated;

-- ---------------------------------------------------------------------------
-- sync_ops, extended. New op types (group_id given when there is no meeting):
--   fine           { id, group_id, member_id, fine_type, amount, meeting_id?, rule_id?, note? }
--   fine_payment   { id, fine_id, amount, method, momo_ref? }
--   loan           { id, group_id, member_id, principal, rate, basis, start_date, due_date, method, note?, guarantors[] }
--   loan_repayment { id, loan_id, amount, method, momo_ref? }
--   loan_interest  { id, loan_id, amount, reason }
--   event_payment  { id, event_id, member_id, amount, method, momo_ref? }
--   event_payout   { id, event_id, amount, method }
--   fund_deposit / fund_withdrawal { id, group_id, member_id?, amount, method, note? }
-- ---------------------------------------------------------------------------
create or replace function public.sync_ops(p_ops jsonb)
returns jsonb language plpgsql set search_path = ''
as $$
declare
  op jsonb;
  oid uuid;
  results jsonb := '[]'::jsonb;
  mt public.meetings;
  slot public.cycle_slots;
  g public.groups;
  f public.fines;
  lo public.loans;
  ev public.social_events;
  gid uuid;
  months int;
  interest bigint;
  n int;
  typ text;
  at timestamptz;
begin
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 500 then
    raise exception 'ops must be an array of at most 500';
  end if;
  for op in select * from jsonb_array_elements(p_ops) loop
    begin
      oid := (op ->> 'id')::uuid;
      typ := op ->> 'type';
      at := coalesce((op ->> 'at')::timestamptz, now());
      mt := null;
      if op ? 'meeting_id' and op ->> 'meeting_id' is not null then
        select * into mt from public.meetings where id = (op ->> 'meeting_id')::uuid;
        if mt.id is null then raise exception 'meeting not found'; end if;
      end if;
      gid := coalesce(mt.group_id, (op ->> 'group_id')::uuid);

      case typ
      when 'payment' then
        insert into public.ledger_entries (id, group_id, member_id, meeting_id, account, kind, amount,
                                           method, momo_ref, recorded_by, client_recorded_at)
        values (oid, mt.group_id, (op ->> 'member_id')::uuid, mt.id, 'njangi', 'contribution_paid',
                (op ->> 'amount')::bigint, (op ->> 'method')::public.pay_method,
                nullif(trim(op ->> 'momo_ref'), ''), auth.uid(), at)
        on conflict (id) do nothing;

      when 'payout' then
        select * into slot from public.cycle_slots where id = (op ->> 'slot_id')::uuid and meeting_id = mt.id;
        if slot.id is null then raise exception 'this hand does not collect at this meeting'; end if;
        insert into public.ledger_entries (id, group_id, member_id, meeting_id, slot_id, account, kind, amount,
                                           method, momo_ref, recorded_by, client_recorded_at)
        values (oid, mt.group_id, slot.member_id, mt.id, slot.id, 'njangi', 'payout',
                (op ->> 'amount')::bigint, (op ->> 'method')::public.pay_method,
                nullif(trim(op ->> 'momo_ref'), ''), auth.uid(), at)
        on conflict (id) do nothing;

      when 'reverse' then
        if not exists (select 1 from public.ledger_entries where id = oid) then
          insert into public.ledger_entries (id, group_id, member_id, meeting_id, slot_id, account, kind, amount,
                                             method, momo_ref, fine_id, loan_id, event_id,
                                             reverses_entry_id, reason, recorded_by, client_recorded_at)
          select oid, o.group_id, o.member_id, o.meeting_id, o.slot_id, o.account, o.kind, o.amount,
                 o.method, o.momo_ref, o.fine_id, o.loan_id, o.event_id,
                 o.id, op ->> 'reason', auth.uid(), at
          from public.ledger_entries o where o.id = (op ->> 'reverses')::uuid;
          get diagnostics n = row_count;
          if n = 0 then raise exception 'entry to correct not found'; end if;
        end if;

      when 'attendance' then
        insert into public.attendance (id, group_id, meeting_id, member_id, status, recorded_by, client_recorded_at)
        values (oid, mt.group_id, mt.id, (op ->> 'member_id')::uuid, (op ->> 'status')::public.attendance_status,
                auth.uid(), at)
        on conflict (meeting_id, member_id) do update
          set status = excluded.status, recorded_by = excluded.recorded_by,
              recorded_at = now(), client_recorded_at = excluded.client_recorded_at
          where public.attendance.client_recorded_at is null
             or public.attendance.client_recorded_at <= excluded.client_recorded_at;

      when 'minutes' then
        update public.meetings set minutes = op ->> 'minutes' where id = mt.id;
        get diagnostics n = row_count;
        if n = 0 then raise exception 'not allowed'; end if;

      when 'close' then
        update public.meetings
        set status = 'closed', closed_at = coalesce(closed_at, now()),
            minutes = coalesce(op ->> 'minutes', minutes)
        where id = mt.id;
        get diagnostics n = row_count;
        if n = 0 then raise exception 'not allowed'; end if;

      when 'fine' then
        if not exists (select 1 from public.fines where id = oid) then
          select * into g from public.groups where id = gid;
          if g.id is null then raise exception 'group not found'; end if;
          insert into public.fines (id, group_id, member_id, meeting_id, type, rule_id, note, created_by)
          values (oid, gid, (op ->> 'member_id')::uuid, mt.id, (op ->> 'fine_type')::public.fine_type,
                  (op ->> 'rule_id')::uuid, nullif(trim(op ->> 'note'), ''), auth.uid());
          insert into public.ledger_entries (id, group_id, member_id, meeting_id, fine_id, account, kind, amount,
                                             note, recorded_by, client_recorded_at)
          values (gen_random_uuid(), gid, (op ->> 'member_id')::uuid, mt.id, oid,
                  case when g.fines_go_to_fund then 'fund' else 'njangi' end::public.ledger_account,
                  'fine_charged', (op ->> 'amount')::bigint, nullif(trim(op ->> 'note'), ''), auth.uid(), at);
        end if;

      when 'fine_payment' then
        select * into f from public.fines where id = (op ->> 'fine_id')::uuid;
        if f.id is null then raise exception 'fine not found'; end if;
        select * into g from public.groups where id = f.group_id;
        insert into public.ledger_entries (id, group_id, member_id, meeting_id, fine_id, account, kind, amount,
                                           method, momo_ref, recorded_by, client_recorded_at)
        values (oid, f.group_id, f.member_id, mt.id, f.id,
                case when g.fines_go_to_fund then 'fund' else 'njangi' end::public.ledger_account,
                'fine_paid', (op ->> 'amount')::bigint, (op ->> 'method')::public.pay_method,
                nullif(trim(op ->> 'momo_ref'), ''), auth.uid(), at)
        on conflict (id) do nothing;

      when 'loan' then
        if not exists (select 1 from public.loans where id = oid) then
          months := public.loan_term_months((op ->> 'start_date')::date, (op ->> 'due_date')::date);
          insert into public.loans (id, group_id, member_id, principal, interest_rate_pct, interest_basis,
                                    start_date, due_date, term_months, method, note, created_by)
          values (oid, gid, (op ->> 'member_id')::uuid, (op ->> 'principal')::bigint,
                  coalesce((op ->> 'rate')::numeric, 0), coalesce((op ->> 'basis')::public.interest_basis, 'per_month'),
                  (op ->> 'start_date')::date, (op ->> 'due_date')::date, months,
                  (op ->> 'method')::public.pay_method, nullif(trim(op ->> 'note'), ''), auth.uid())
          returning * into lo;
          insert into public.loan_guarantors (group_id, loan_id, member_id)
          select gid, oid, (x #>> '{}')::uuid from jsonb_array_elements(coalesce(op -> 'guarantors', '[]'::jsonb)) x
          where (x #>> '{}')::uuid <> lo.member_id
          on conflict do nothing;
          insert into public.ledger_entries (id, group_id, member_id, loan_id, account, kind, amount, method,
                                             recorded_by, client_recorded_at)
          values (gen_random_uuid(), gid, lo.member_id, oid, 'fund', 'loan_disbursed', lo.principal, lo.method, auth.uid(), at);
          interest := public.loan_interest_amount(lo.principal, lo.interest_rate_pct, lo.interest_basis, months);
          if interest > 0 then
            insert into public.ledger_entries (id, group_id, member_id, loan_id, account, kind, amount, note,
                                               recorded_by, client_recorded_at)
            values (gen_random_uuid(), gid, lo.member_id, oid, 'fund', 'loan_interest', interest,
                    'Agreed interest', auth.uid(), at);
          end if;
        end if;

      when 'loan_repayment', 'loan_interest' then
        select * into lo from public.loans where id = (op ->> 'loan_id')::uuid;
        if lo.id is null then raise exception 'loan not found'; end if;
        if typ = 'loan_interest' and length(coalesce(trim(op ->> 'reason'), '')) < 3 then
          raise exception 'a reason is required';
        end if;
        insert into public.ledger_entries (id, group_id, member_id, meeting_id, loan_id, account, kind, amount,
                                           method, momo_ref, note, recorded_by, client_recorded_at)
        values (oid, lo.group_id, lo.member_id, mt.id, lo.id, 'fund',
                case when typ = 'loan_repayment' then 'loan_repaid' else 'loan_interest' end::public.ledger_kind,
                (op ->> 'amount')::bigint, (op ->> 'method')::public.pay_method,
                nullif(trim(op ->> 'momo_ref'), ''), nullif(trim(op ->> 'reason'), ''), auth.uid(), at)
        on conflict (id) do nothing;
        update public.loans set status = case when b.balance <= 0 then 'repaid' else 'active' end::public.loan_status
        from public.loan_balances b where b.id = lo.id and public.loans.id = lo.id and public.loans.status <> 'defaulted';

      when 'event_payment' then
        select * into ev from public.social_events where id = (op ->> 'event_id')::uuid;
        if ev.id is null then raise exception 'event not found'; end if;
        insert into public.ledger_entries (id, group_id, member_id, meeting_id, event_id, account, kind, amount,
                                           method, momo_ref, recorded_by, client_recorded_at)
        values (oid, ev.group_id, (op ->> 'member_id')::uuid, mt.id, ev.id, 'social', 'event_paid',
                (op ->> 'amount')::bigint, (op ->> 'method')::public.pay_method,
                nullif(trim(op ->> 'momo_ref'), ''), auth.uid(), at)
        on conflict (id) do nothing;

      when 'event_payout' then
        select * into ev from public.social_events where id = (op ->> 'event_id')::uuid;
        if ev.id is null then raise exception 'event not found'; end if;
        if ev.for_member_id is null then raise exception 'this event has no member to receive the money'; end if;
        insert into public.ledger_entries (id, group_id, member_id, event_id, account, kind, amount,
                                           method, recorded_by, client_recorded_at)
        values (oid, ev.group_id, ev.for_member_id, ev.id, 'social', 'event_payout',
                (op ->> 'amount')::bigint, (op ->> 'method')::public.pay_method, auth.uid(), at)
        on conflict (id) do nothing;

      when 'fund_deposit', 'fund_withdrawal' then
        insert into public.ledger_entries (id, group_id, member_id, account, kind, amount, method, note,
                                           recorded_by, client_recorded_at)
        values (oid, gid, (op ->> 'member_id')::uuid, 'fund', typ::public.ledger_kind, (op ->> 'amount')::bigint,
                (op ->> 'method')::public.pay_method, nullif(trim(op ->> 'note'), ''), auth.uid(), at)
        on conflict (id) do nothing;

      else
        raise exception 'unknown op type';
      end case;

      -- Make sure the row really exists (Row Level Security can silently turn an insert into a no-op).
      if (typ in ('payment', 'payout', 'reverse', 'fine_payment', 'loan_repayment', 'loan_interest',
                  'event_payment', 'event_payout', 'fund_deposit', 'fund_withdrawal')
          and not exists (select 1 from public.ledger_entries where id = oid))
         or (typ = 'fine' and not exists (select 1 from public.fines where id = oid))
         or (typ = 'loan' and not exists (select 1 from public.loans where id = oid)) then
        raise exception 'not saved';
      end if;

      results := results || jsonb_build_object('id', oid, 'ok', true);
    exception when others then
      results := results || jsonb_build_object('id', op ->> 'id', 'ok', false, 'error', sqlerrm);
    end;
  end loop;
  return results;
end;
$$;
revoke all on function public.sync_ops from public, anon;
grant execute on function public.sync_ops to authenticated;
