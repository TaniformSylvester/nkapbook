-- Phone numbers from any country (diaspora members and officials abroad).
-- Stored as digits with the country code, no "+": 237670123456, 447911123456.
-- Cameroon numbers keep the strict check (9 digits starting with 6 or 2).
alter domain public.cm_phone drop constraint cm_phone_check;
alter domain public.cm_phone add constraint phone_number_check
  check (value ~ '^[1-9][0-9]{7,14}$' and (value !~ '^237' or value ~ '^237[26][0-9]{8}$'));
alter domain public.cm_phone rename to phone_number;

-- The creator's own number (from sign-in) is now saved whatever the country.
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
  values (gid, p_president_name,
          case when ph ~ '^[1-9][0-9]{7,14}$' and (ph !~ '^237' or ph ~ '^237[26][0-9]{8}$') then ph end,
          'president', uid);
  return gid;
end;
$$;
revoke all on function public.create_group from public, anon;
grant execute on function public.create_group to authenticated;
