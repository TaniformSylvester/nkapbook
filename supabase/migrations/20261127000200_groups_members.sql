-- Phase 3: groups and members.

-- Invites can be cancelled by the president (kept for the record, never deleted).
alter table public.official_invites add column cancelled_at timestamptz;
alter table public.official_invites add column cancelled_by uuid references auth.users (id);

drop index public.official_invites_open;
create unique index official_invites_open on public.official_invites (group_id, phone)
  where accepted_at is null and cancelled_at is null;

revoke update on public.official_invites from authenticated;
grant update (cancelled_at, cancelled_by) on public.official_invites to authenticated;
create policy invites_cancel on public.official_invites for update to authenticated
  using (private.is_group_president(group_id) and accepted_at is null)
  with check (private.is_group_president(group_id) and cancelled_by = (select auth.uid()));

-- Invites must point at a member of the group, so the person has a name in the list.
create or replace function private.invites_guard()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.member_id is null then raise exception 'invite must name a member'; end if;
    if new.accepted_at is not null or new.cancelled_at is not null then
      raise exception 'new invites start open';
    end if;
  end if;
  return new;
end;
$$;
create trigger invites_guard before insert on public.official_invites
  for each row execute function private.invites_guard();

-- accept_invites: ignore cancelled invites.
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
  for inv in select * from public.official_invites
             where phone = ph and accepted_at is null and cancelled_at is null loop
    select id into mid from public.members where group_id = inv.group_id and user_id = uid;
    if mid is null then
      mid := inv.member_id;
      -- the invited member row must not already belong to another login
      if exists (select 1 from public.members where id = mid and user_id is not null and user_id <> uid) then
        continue;
      end if;
    end if;
    begin
      update public.members set user_id = uid, role = inv.role, status = 'active' where id = mid;
      update public.official_invites set accepted_at = now(), accepted_by = uid, member_id = mid where id = inv.id;
      n := n + 1;
    exception when others then
      -- e.g. it would leave the group without a president: skip it, never block sign-in
      null;
    end;
  end loop;
  return n;
end;
$$;
revoke all on function public.accept_invites from public, anon;
grant execute on function public.accept_invites to authenticated;

-- A group always keeps at least one active president with a login.
create or replace function private.keep_a_president()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.role = 'president' and old.status = 'active'
     and (new.role <> 'president' or new.status <> 'active') then
    if not exists (
      select 1 from public.members m
      where m.group_id = new.group_id and m.id <> new.id
        and m.role = 'president' and m.status = 'active' and m.user_id is not null
    ) then
      raise exception 'the group needs a president: make someone else president first';
    end if;
  end if;
  return new;
end;
$$;
create trigger members_keep_president before update on public.members
  for each row execute function private.keep_a_president();

-- Leaving the group: record the date automatically.
create or replace function private.members_left_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status = 'left' and old.status <> 'left' and new.left_at is null then
    new.left_at := current_date;
  elsif new.status = 'active' then
    new.left_at := null;
  end if;
  return new;
end;
$$;
create trigger members_left_at before update on public.members
  for each row execute function private.members_left_at();
