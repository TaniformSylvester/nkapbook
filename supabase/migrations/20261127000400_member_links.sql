-- Phase 5: the member's private link ("My NkapBook") and payout confirmation.
-- These functions are callable only by the server (service role). The server passes the
-- visitor's IP for rate limiting. A link reveals one member's record plus group basics.

alter table public.member_links add column last_opened_at timestamptz;

-- Don't fill the audit log every time a member opens their page: only log real changes.
drop trigger audit_member_links on public.member_links;
create trigger audit_member_links after insert or delete or update of token, revoked_at, member_id
  on public.member_links for each row execute function private.audit_row();

create or replace function private.link_member(p_token text)
returns public.member_links language sql stable security definer set search_path = ''
as $$ select * from public.member_links where token = p_token $$;

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
    'group', jsonb_build_object('name', g.name, 'town', g.town, 'language', g.language,
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

create or replace function public.confirm_payout(p_token text, p_entry uuid, p_ip text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  l public.member_links;
  e public.ledger_entries;
begin
  if not private.hit_rate_limit('link_ip', coalesce(p_ip, '?'), 120, 600) then return 'rate_limited'; end if;
  l := private.link_member(p_token);
  if l.id is null or l.revoked_at is not null then return 'not_found'; end if;
  select * into e from public.ledger_entries
  where id = p_entry and member_id = l.member_id and kind = 'payout' and reverses_entry_id is null;
  if e.id is null or exists (select 1 from public.ledger_entries r where r.reverses_entry_id = e.id) then
    return 'not_found';
  end if;
  insert into public.payout_confirmations (payout_entry_id, group_id, member_id, via)
  values (e.id, e.group_id, e.member_id, 'member_link')
  on conflict (payout_entry_id) do nothing;
  return 'ok';
end;
$$;

revoke all on function private.link_member(text) from public;
revoke all on function public.member_view(text, text) from public, anon, authenticated;
revoke all on function public.confirm_payout(text, uuid, text) from public, anon, authenticated;
grant execute on function public.member_view(text, text) to service_role;
grant execute on function public.confirm_payout(text, uuid, text) to service_role;
