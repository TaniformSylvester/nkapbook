-- Members' names and phone numbers: visible to that group's officials only, not to the platform admin.
drop policy members_read on public.members;
create policy members_read on public.members for select to authenticated
  using (private.is_group_official(group_id));

-- What the platform admin needs for support: group-level numbers, no member details.
create or replace function public.admin_overview()
returns table (id uuid, name text, town text, plan public.group_plan, status public.group_status, language public.lang,
               created_at timestamptz, members bigint, meetings bigint, last_activity timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'not allowed'; end if;
  return query
    select g.id, g.name, g.town, g.plan, g.status, g.language, g.created_at,
      (select count(*) from public.members m where m.group_id = g.id and m.status = 'active'),
      (select count(*) from public.meetings mt where mt.group_id = g.id),
      (select max(l.recorded_at) from public.ledger_entries l where l.group_id = g.id)
    from public.groups g
    order by g.created_at desc;
end;
$$;
revoke all on function public.admin_overview from public, anon;
grant execute on function public.admin_overview to authenticated;
