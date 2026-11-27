-- 1) Meeting mode: each member's unpaid fines and active loans travel with the meeting snapshot,
--    so the treasurer can collect them with no network. 2) Sharing private links in bulk.

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
  today_other as (
    -- fines and loan repayments collected at this meeting (any account)
    select l.member_id,
      coalesce(sum(case when l.reverses_entry_id is null then l.amount else -l.amount end) filter (where l.kind = 'fine_paid'), 0) as fines_paid_today,
      coalesce(sum(case when l.reverses_entry_id is null then l.amount else -l.amount end) filter (where l.kind = 'loan_repaid'), 0) as loans_paid_today
    from public.ledger_entries l where l.meeting_id = p_meeting group by l.member_id
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
    -- every record already saved for this meeting, and every fine id, so the phone never counts them twice
    'entry_ids', coalesce((select jsonb_agg(l.id) from public.ledger_entries l where l.meeting_id = p_meeting), '[]'::jsonb),
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
        'fines_paid_today', coalesce(tt.fines_paid_today, 0),
        'loans_paid_today', coalesce(tt.loans_paid_today, 0),
        'attendance', (select a.status from public.attendance a where a.meeting_id = p_meeting and a.member_id = m.id),
        'payments', coalesce((
          select jsonb_agg(jsonb_build_object('id', l.id, 'amount', l.amount, 'method', l.method,
                                              'momo_ref', l.momo_ref, 'at', coalesce(l.client_recorded_at, l.recorded_at),
                                              'reversed', l.id in (select id from reversed))
                           order by l.recorded_at)
          from le l where l.member_id = m.id and l.meeting_id = p_meeting
            and l.kind = 'contribution_paid' and l.reverses_entry_id is null), '[]'::jsonb),
        'fines', coalesce((
          select jsonb_agg(jsonb_build_object('id', fb.id, 'type', fb.type, 'balance', fb.balance) order by fb.created_at)
          from public.fine_balances fb where fb.member_id = m.id and fb.balance > 0), '[]'::jsonb),
        'loans', coalesce((
          select jsonb_agg(jsonb_build_object('id', lb.id, 'balance', lb.balance, 'due_date', lb.due_date, 'overdue', lb.overdue)
                           order by lb.due_date)
          from public.loan_balances lb where lb.member_id = m.id and lb.status = 'active' and lb.balance > 0), '[]'::jsonb)
      ) order by lower(m.name))
      from mem m left join per on per.member_id = m.id left join today_other tt on tt.member_id = m.id), '[]'::jsonb)
  )
  from mt
$$;
revoke all on function public.meeting_snapshot from public, anon;
grant execute on function public.meeting_snapshot to authenticated;

-- Sharing private links in bulk: create the link if needed and remember when it was shared.
alter table public.member_links add column shared_at timestamptz;

create or replace function public.share_member_link(p_member_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  gid uuid;
  tok text;
begin
  select group_id into gid from public.members where id = p_member_id and status = 'active';
  if gid is null or not private.is_group_official(gid) then raise exception 'not allowed'; end if;
  select token into tok from public.member_links where member_id = p_member_id and revoked_at is null;
  if tok is null then
    tok := private.new_link_token();
    insert into public.member_links (group_id, member_id, token, created_by) values (gid, p_member_id, tok, auth.uid());
  end if;
  update public.member_links set shared_at = now() where member_id = p_member_id and revoked_at is null;
  return tok;
end;
$$;
revoke all on function public.share_member_link from public, anon;
grant execute on function public.share_member_link to authenticated;
