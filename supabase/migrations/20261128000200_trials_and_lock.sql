-- Free trial for new groups, a grace period after a plan ends, then only "open a meeting" pauses.
-- Records always stay visible and exportable; member links keep working; an open meeting can always
-- be finished and synced. Pilot and free groups are never affected.

-- Every new group: 60-day free trial.
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
  insert into public.groups (name, town, language, frequency, meeting_day, contribution_per_hand, start_date, created_by, plan, paid_until)
  values (p_name, p_town, p_language, p_frequency, p_meeting_day, p_contribution_per_hand, coalesce(p_start_date, current_date), uid,
          'trial', (now() at time zone 'Africa/Douala')::date + 60)
  returning id into gid;
  insert into public.members (group_id, name, phone, role, user_id)
  values (gid, p_president_name,
          case when ph ~ '^[1-9][0-9]{7,14}$' and (ph !~ '^237' or ph ~ '^237[26][0-9]{8}$') then ph end,
          'president', uid);
  return gid;
end;
$$;
revoke all on function public.create_group from public, anon;
grant execute on function public.create_group to authenticated;

-- Can this group open new meetings? Pilot/free: always. Trial/paid: until 14 days after the end date.
create or replace function private.can_open_meetings(gid uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case when g.plan in ('pilot', 'free') then true
              else coalesce(g.paid_until + 14 >= (now() at time zone 'Africa/Douala')::date, false) end
  from public.groups g where g.id = gid
$$;
grant execute on function private.can_open_meetings(uuid) to authenticated, service_role;

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
  -- an existing meeting can always be reopened and finished
  select id into existing from public.meetings where id = mid or (group_id = p_group and date = p_date) limit 1;
  if existing is not null then return existing; end if;
  if not private.can_open_meetings(p_group) then
    raise exception 'subscription_ended: renew the NkapBook subscription to open new meetings';
  end if;

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

-- Groups that were created on "pilot" by default but aren't the owner's hand-picked pilots:
-- handled per group by the platform admin. (The live database update is done separately.)
