-- Phase 4: cycles (turn order), meetings, offline sync, payouts.

-- How many hands collect at each meeting (1 for most groups).
alter table public.groups add column collectors_per_meeting smallint not null default 1
  check (collectors_per_meeting between 1 and 10);

alter table public.cycles add column first_date date;
-- One cycle being prepared or running at a time.
create unique index cycles_one_open on public.cycles (group_id) where status in ('draft', 'active');

alter table public.cycle_slots add constraint cycle_slots_group_id_key unique (group_id, id);
-- payouts point at the turn (slot) they pay
alter table public.ledger_entries add column slot_id uuid;
alter table public.ledger_entries add constraint ledger_slot_fk
  foreign key (group_id, slot_id) references public.cycle_slots (group_id, id);

-- one meeting per group per day, so two officials can't open the same meeting twice
create unique index meetings_one_per_day on public.meetings (group_id, date);

-- last change wins when two phones mark attendance offline
alter table public.attendance add column client_recorded_at timestamptz;

-- Cycles and slots change only through the functions below (audited).
revoke insert, update on public.cycles from authenticated;
revoke insert, update on public.cycle_slots from authenticated;
grant update (meeting_id) on public.cycle_slots to authenticated;

-- ---------------------------------------------------------------------------
-- Dates
-- ---------------------------------------------------------------------------
create or replace function private.nth_meeting_date(p_freq public.meeting_frequency, p_first date, p_idx int)
returns date language sql immutable set search_path = ''
as $$
  select case p_freq
    when 'weekly' then p_first + 7 * p_idx
    when 'biweekly' then p_first + 14 * p_idx
    else (p_first + make_interval(months => p_idx))::date
  end
$$;

-- ---------------------------------------------------------------------------
-- Filling the turn order
-- ---------------------------------------------------------------------------
-- Manual: p_order is [{ "member_id": ..., "hand_no": 1 }, ...] covering every active hand once.
-- Draw: a random seed is recorded; the order is sorted by sha256(seed:member_id:hand_no),
-- so anyone can recompute it from the seed and confirm nobody changed it.
create or replace function private.fill_slots(p_cycle uuid, p_method public.order_method, p_order jsonb, p_witness text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  c public.cycles;
  g public.groups;
  v_seed text;
  n_hands int;
  n_given int;
begin
  select * into c from public.cycles where id = p_cycle;
  select * into g from public.groups where id = c.group_id;
  if c.status <> 'draft' then raise exception 'the order is locked once the cycle has started'; end if;

  delete from public.cycle_slots where cycle_id = p_cycle;

  create temp table _hands on commit drop as
    select m.id as member_id, m.name, h.n::smallint as hand_no
    from public.members m, generate_series(1, m.hands) h(n)
    where m.group_id = c.group_id and m.status = 'active';
  select count(*) into n_hands from _hands;
  if n_hands = 0 then raise exception 'add members before setting the order'; end if;

  if p_method = 'manual' then
    create temp table _order on commit drop as
      select (e ->> 'member_id')::uuid as member_id, (e ->> 'hand_no')::smallint as hand_no, i::int as pos
      from jsonb_array_elements(coalesce(p_order, '[]'::jsonb)) with ordinality t(e, i);
    select count(*) into n_given from _order;
    if n_given <> n_hands
       or (select count(*) from (select distinct member_id, hand_no from _order) d) <> n_hands
       or exists (select 1 from _order o where not exists (
            select 1 from _hands h where h.member_id = o.member_id and h.hand_no = o.hand_no)) then
      raise exception 'the order must list every hand exactly once';
    end if;
    insert into public.cycle_slots (group_id, cycle_id, position, member_id, hand_no, planned_date)
    select c.group_id, p_cycle, o.pos, o.member_id, o.hand_no,
           private.nth_meeting_date(g.frequency, c.first_date, (o.pos - 1) / g.collectors_per_meeting)
    from _order o;
    drop table _order;
  else
    v_seed := encode(extensions.gen_random_bytes(16), 'hex');
    insert into public.cycle_slots (group_id, cycle_id, position, member_id, hand_no, planned_date)
    select c.group_id, p_cycle, r.pos, r.member_id, r.hand_no,
           private.nth_meeting_date(g.frequency, c.first_date, (r.pos - 1) / g.collectors_per_meeting)
    from (
      select h.*, row_number() over (
        order by encode(extensions.digest(v_seed || ':' || h.member_id || ':' || h.hand_no, 'sha256'), 'hex')
      )::int as pos
      from _hands h
    ) r;
    insert into public.cycle_draws (group_id, cycle_id, seed, result, drawn_by, witness_note)
    select c.group_id, p_cycle, v_seed,
           jsonb_agg(jsonb_build_object('position', s.position, 'member_id', s.member_id,
                     'name', m.name, 'hand_no', s.hand_no) order by s.position),
           auth.uid(), nullif(trim(p_witness), '')
    from public.cycle_slots s join public.members m on m.id = s.member_id
    where s.cycle_id = p_cycle;
  end if;

  update public.cycles set order_method = p_method where id = p_cycle;
  drop table _hands;
end;
$$;
revoke all on function private.fill_slots from public;

create or replace function public.create_cycle(
  p_group uuid, p_method public.order_method, p_first_date date, p_order jsonb default null, p_witness text default null
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare cid uuid;
begin
  if not private.is_group_official(p_group) then raise exception 'not allowed'; end if;
  if p_first_date is null then raise exception 'first date is required'; end if;
  insert into public.cycles (group_id, number, status, order_method, first_date, created_by)
  values (p_group, coalesce((select max(number) from public.cycles where group_id = p_group), 0) + 1,
          'draft', p_method, p_first_date, auth.uid())
  returning id into cid;
  perform private.fill_slots(cid, p_method, p_order, p_witness);
  return cid;
end;
$$;

-- Change the order (or draw again) while the cycle is still a draft. Every draw stays on record.
create or replace function public.reorder_cycle(
  p_cycle uuid, p_method public.order_method, p_first_date date, p_order jsonb default null, p_witness text default null
) returns void language plpgsql security definer set search_path = ''
as $$
declare gid uuid;
begin
  select group_id into gid from public.cycles where id = p_cycle;
  if gid is null or not private.is_group_official(gid) then raise exception 'not allowed'; end if;
  if p_first_date is not null then update public.cycles set first_date = p_first_date where id = p_cycle; end if;
  perform private.fill_slots(p_cycle, p_method, p_order, p_witness);
end;
$$;

create or replace function public.start_cycle(p_cycle uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare gid uuid;
begin
  select group_id into gid from public.cycles where id = p_cycle and status = 'draft';
  if gid is null or not private.is_group_official(gid) then raise exception 'not allowed'; end if;
  update public.cycles set status = 'active' where id = p_cycle;
end;
$$;

-- Mark a finished cycle as completed so a new one can be prepared.
create or replace function public.complete_cycle(p_cycle uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare gid uuid;
begin
  select group_id into gid from public.cycles where id = p_cycle and status = 'active';
  if gid is null or not private.is_group_official(gid) then raise exception 'not allowed'; end if;
  if exists (select 1 from public.cycle_slots where cycle_id = p_cycle and meeting_id is null) then
    raise exception 'some hands have not collected yet';
  end if;
  update public.cycles set status = 'completed' where id = p_cycle;
end;
$$;

revoke all on function public.create_cycle, public.reorder_cycle, public.start_cycle, public.complete_cycle from public, anon;
grant execute on function public.create_cycle, public.reorder_cycle, public.start_cycle, public.complete_cycle to authenticated;

-- ---------------------------------------------------------------------------
-- Opening a meeting: dues for every active member, and today's collector(s).
-- Runs with the caller's rights, so Row Level Security applies to every write.
-- ---------------------------------------------------------------------------
create or replace function public.open_meeting(p_group uuid, p_date date, p_id uuid default null)
returns uuid language plpgsql set search_path = ''
as $$
declare
  g public.groups;
  cyc uuid;
  mid uuid := coalesce(p_id, gen_random_uuid());
  existing uuid;
begin
  if not private.is_group_official(p_group) then raise exception 'not allowed'; end if;
  select id into existing from public.meetings where id = mid or (group_id = p_group and date = p_date) limit 1;
  if existing is not null then return existing; end if;

  select * into g from public.groups where id = p_group;
  select id into cyc from public.cycles where group_id = p_group and status = 'active';

  insert into public.meetings (id, group_id, cycle_id, date, status, opened_at, created_by)
  values (mid, p_group, cyc, p_date, 'open', now(), auth.uid());

  if cyc is not null then
    update public.cycle_slots set meeting_id = mid
    where id in (
      select id from public.cycle_slots
      where cycle_id = cyc and meeting_id is null
      order by position limit g.collectors_per_meeting
    );
  end if;

  insert into public.ledger_entries (id, group_id, member_id, meeting_id, account, kind, amount, recorded_by)
  select gen_random_uuid(), p_group, m.id, mid, 'njangi', 'contribution_due',
         m.hands * g.contribution_per_hand, auth.uid()
  from public.members m
  where m.group_id = p_group and m.status = 'active';

  return mid;
end;
$$;
revoke all on function public.open_meeting from public, anon;
grant execute on function public.open_meeting to authenticated;

-- ---------------------------------------------------------------------------
-- Everything meeting mode needs, in one call. Caller's rights (RLS applies).
-- owing_before = dues of earlier meetings minus payments recorded outside this meeting before it.
-- ---------------------------------------------------------------------------
create or replace function public.meeting_snapshot(p_meeting uuid)
returns jsonb language sql stable set search_path = ''
as $$
  with mt as (
    select * from public.meetings where id = p_meeting
  ),
  g as (
    select gr.* from public.groups gr join mt on mt.group_id = gr.id
  ),
  le as (
    select l.*, coalesce(lm.date, (l.recorded_at at time zone 'Africa/Douala')::date) as on_date,
           case when l.reverses_entry_id is null then l.amount else -l.amount end as net
    from public.ledger_entries l
    left join public.meetings lm on lm.id = l.meeting_id
    where l.group_id = (select group_id from mt) and l.account = 'njangi'
  ),
  reversed as (
    select reverses_entry_id as id from le where reverses_entry_id is not null
  ),
  per as (
    select member_id,
      coalesce(sum(net) filter (where kind = 'contribution_due' and meeting_id = p_meeting), 0) as due_today,
      coalesce(sum(net) filter (where kind = 'contribution_paid' and meeting_id = p_meeting), 0) as paid_today,
      coalesce(sum(net) filter (where kind = 'contribution_due' and meeting_id is distinct from p_meeting
                                  and on_date < (select date from mt)), 0)
      - coalesce(sum(net) filter (where kind = 'contribution_paid' and meeting_id is distinct from p_meeting
                                  and on_date <= (select date from mt)), 0) as owing_before
    from le group by member_id
  ),
  mem as (
    select m.* from public.members m
    where m.group_id = (select group_id from mt)
      and (m.status = 'active' or exists (select 1 from le where le.member_id = m.id and le.meeting_id = p_meeting))
  )
  select jsonb_build_object(
    'fetched_at', now(),
    'meeting', (select jsonb_build_object('id', id, 'group_id', group_id, 'date', date, 'status', status,
                                          'minutes', minutes, 'cycle_id', cycle_id) from mt),
    'group', (select jsonb_build_object('id', id, 'name', name, 'language', language,
                                        'contribution_per_hand', contribution_per_hand,
                                        'collectors_per_meeting', collectors_per_meeting) from g),
    'collectors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'slot_id', s.id, 'position', s.position, 'hand_no', s.hand_no, 'member_id', s.member_id, 'name', m.name,
        'payouts', coalesce((
          select jsonb_agg(jsonb_build_object('id', p.id, 'amount', p.amount, 'method', p.method,
                                              'reversed', p.id in (select id from reversed),
                                              'confirmed', exists (select 1 from public.payout_confirmations pc
                                                                   where pc.payout_entry_id = p.id))
                           order by p.recorded_at)
          from le p where p.slot_id = s.id and p.kind = 'payout' and p.reverses_entry_id is null), '[]'::jsonb)
      ) order by s.position)
      from public.cycle_slots s join public.members m on m.id = s.member_id
      where s.meeting_id = p_meeting), '[]'::jsonb),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'hands', m.hands, 'status', m.status,
        'due_today', coalesce(per.due_today, 0),
        'paid_today', coalesce(per.paid_today, 0),
        'owing_before', coalesce(per.owing_before, 0),
        'attendance', (select a.status from public.attendance a where a.meeting_id = p_meeting and a.member_id = m.id),
        'payments', coalesce((
          select jsonb_agg(jsonb_build_object('id', l.id, 'amount', l.amount, 'method', l.method,
                                              'momo_ref', l.momo_ref, 'at', coalesce(l.client_recorded_at, l.recorded_at),
                                              'reversed', l.id in (select id from reversed))
                           order by l.recorded_at)
          from le l where l.member_id = m.id and l.meeting_id = p_meeting
            and l.kind = 'contribution_paid' and l.reverses_entry_id is null), '[]'::jsonb)
      ) order by lower(m.name))
      from mem m left join per on per.member_id = m.id), '[]'::jsonb)
  )
  from mt
$$;
revoke all on function public.meeting_snapshot from public, anon;
grant execute on function public.meeting_snapshot to authenticated;

-- ---------------------------------------------------------------------------
-- Offline sync. Each op carries an id made on the phone; replaying a batch is harmless.
-- Caller's rights: Row Level Security decides what is allowed. One bad op never blocks the rest.
--   payment    { id, meeting_id, member_id, amount, method, momo_ref?, at }
--   reverse    { id, reverses, reason, at }
--   payout     { id, meeting_id, slot_id, amount, method, momo_ref?, at }
--   attendance { id, meeting_id, member_id, status, at }
--   close      { id, meeting_id, minutes? }
--   minutes    { id, meeting_id, minutes }
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
  n int;
begin
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 500 then
    raise exception 'ops must be an array of at most 500';
  end if;
  for op in select * from jsonb_array_elements(p_ops) loop
    begin
      oid := (op ->> 'id')::uuid;
      mt := null;
      if op ? 'meeting_id' then
        select * into mt from public.meetings where id = (op ->> 'meeting_id')::uuid;
        if mt.id is null then raise exception 'meeting not found'; end if;
      end if;

      case op ->> 'type'
      when 'payment' then
        insert into public.ledger_entries (id, group_id, member_id, meeting_id, account, kind, amount,
                                           method, momo_ref, recorded_by, client_recorded_at)
        values (oid, mt.group_id, (op ->> 'member_id')::uuid, mt.id, 'njangi', 'contribution_paid',
                (op ->> 'amount')::bigint, (op ->> 'method')::public.pay_method,
                nullif(trim(op ->> 'momo_ref'), ''), auth.uid(), (op ->> 'at')::timestamptz)
        on conflict (id) do nothing;

      when 'payout' then
        select * into slot from public.cycle_slots where id = (op ->> 'slot_id')::uuid and meeting_id = mt.id;
        if slot.id is null then raise exception 'this hand does not collect at this meeting'; end if;
        insert into public.ledger_entries (id, group_id, member_id, meeting_id, slot_id, account, kind, amount,
                                           method, momo_ref, recorded_by, client_recorded_at)
        values (oid, mt.group_id, slot.member_id, mt.id, slot.id, 'njangi', 'payout',
                (op ->> 'amount')::bigint, (op ->> 'method')::public.pay_method,
                nullif(trim(op ->> 'momo_ref'), ''), auth.uid(), (op ->> 'at')::timestamptz)
        on conflict (id) do nothing;

      when 'reverse' then
        if exists (select 1 from public.ledger_entries where id = oid) then
          null; -- already synced
        else
          insert into public.ledger_entries (id, group_id, member_id, meeting_id, slot_id, account, kind, amount,
                                             method, momo_ref, fine_id, loan_id, event_id,
                                             reverses_entry_id, reason, recorded_by, client_recorded_at)
          select oid, o.group_id, o.member_id, o.meeting_id, o.slot_id, o.account, o.kind, o.amount,
                 o.method, o.momo_ref, o.fine_id, o.loan_id, o.event_id,
                 o.id, op ->> 'reason', auth.uid(), (op ->> 'at')::timestamptz
          from public.ledger_entries o where o.id = (op ->> 'reverses')::uuid;
          get diagnostics n = row_count;
          if n = 0 then raise exception 'entry to correct not found'; end if;
        end if;

      when 'attendance' then
        insert into public.attendance (id, group_id, meeting_id, member_id, status, recorded_by, client_recorded_at)
        values (oid, mt.group_id, mt.id, (op ->> 'member_id')::uuid, (op ->> 'status')::public.attendance_status,
                auth.uid(), (op ->> 'at')::timestamptz)
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

      else
        raise exception 'unknown op type';
      end case;

      -- For ledger ops, make sure the row really exists (RLS can silently hide a no-op).
      if op ->> 'type' in ('payment', 'payout', 'reverse')
         and not exists (select 1 from public.ledger_entries where id = oid) then
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
