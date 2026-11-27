-- Demo group "Unity Njangi" for showing NkapBook to secretaries.
-- Run in the Supabase SQL editor (or psql) AFTER the president has signed in once.
-- Change the phone number below to the president's sign-in number (2376XXXXXXXX).
-- Safe to run twice: it stops if that president already has a group called "Unity Njangi".
-- Demo members have NO phone numbers, so nobody real can receive a reminder by accident.

do $$
declare
  president_phone text := '237670000001';   -- <-- change me
  uid uuid;
  gid uuid;
  mids uuid[];
  names text[] := array[
    'Mary Ndi', 'Pa Joe Tabi', 'Ma Grace Awah', 'Ayuk Nkongho', 'Comfort Fon', 'Emmanuel Che',
    'Brenda Ngwa', 'Peter Mbah', 'Rose Akwi', 'Divine Tanyi', 'Agnes Bih', 'Samuel Atanga',
    'Lucy Ekane', 'Kingsley Nfor'];
  meeting_dates date[] := array['2026-11-08', '2026-11-15', '2026-11-22']::date[];
  mid uuid;
  mem record;
  i int;
  k int;
  ops jsonb;
  slot record;
  rule_late uuid;
  loan_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  first_fine uuid;
begin
  select id into uid from auth.users where phone = president_phone;
  if uid is null then
    raise exception 'No user with phone %: sign in once with that number first.', president_phone;
  end if;
  if exists (select 1 from public.groups g join public.members m on m.group_id = g.id
             where g.name = 'Unity Njangi' and m.user_id = uid) then
    raise notice 'Unity Njangi already exists for this president: nothing to do.';
    return;
  end if;

  -- act as the president, so every record says who recorded it
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);

  gid := public.create_group('Unity Njangi', 'Bamenda', 'pcm', 'weekly', 0::smallint, 5000, '2026-11-08', 'Pa Emmanuel Fru');

  -- 14 more members; Mary and Comfort hold 2 hands (17 hands in all)
  for i in 1 .. array_length(names, 1) loop
    insert into public.members (group_id, name, hands, role, whatsapp_opt_in)
    values (gid, names[i], case when names[i] in ('Mary Ndi', 'Comfort Fon') then 2 else 1 end,
            case names[i] when 'Ma Grace Awah' then 'secretary' when 'Pa Joe Tabi' then 'treasurer' else 'member' end::public.member_role,
            i % 3 <> 0);
  end loop;
  select array_agg(id order by name) into mids from public.members where group_id = gid;

  insert into public.fine_rules (group_id, type, amount) values (gid, 'late_payment', 500), (gid, 'absence', 1000), (gid, 'lateness', 200);

  -- savings: everyone put 10,000 in the fund at the start
  select jsonb_agg(jsonb_build_object('type', 'fund_deposit', 'id', gen_random_uuid(), 'group_id', gid, 'member_id', id,
                   'amount', 10000, 'method', 'cash', 'note', 'Opening savings', 'at', '2026-11-08T15:00:00+01'))
  into ops from public.members where group_id = gid;
  perform public.sync_ops(ops);

  -- turn order by recorded draw, then started
  perform public.start_cycle(public.create_cycle(gid, 'draw', '2026-11-08', null, 'Drawn at the first meeting, all 15 members present'));

  -- three past meetings
  for k in 1 .. 3 loop
    mid := public.open_meeting(gid, meeting_dates[k]);
    ops := '[]'::jsonb;
    i := 0;
    for mem in select m.id, m.name, m.hands from public.members m where m.group_id = gid order by m.name loop
      i := i + 1;
      -- attendance: one absent and one late each week, different people
      ops := ops || jsonb_build_object('type', 'attendance', 'id', gen_random_uuid(), 'meeting_id', mid, 'member_id', mem.id,
        'status', case when i = (k * 4) % 15 + 1 then 'absent' when i = (k * 7) % 15 + 1 then 'late' else 'present' end,
        'at', meeting_dates[k] + time '15:05');
      -- payments: most pay in full; a few pay part; some by MoMo with a reference
      if i = (k * 4) % 15 + 1 then
        continue; -- the absent member pays nothing this week
      elsif i in (3, 11) and k >= 2 then
        ops := ops || jsonb_build_object('type', 'payment', 'id', gen_random_uuid(), 'meeting_id', mid, 'member_id', mem.id,
          'amount', 3000, 'method', 'cash', 'at', meeting_dates[k] + time '15:20');
      else
        ops := ops || jsonb_build_object('type', 'payment', 'id', gen_random_uuid(), 'meeting_id', mid, 'member_id', mem.id,
          'amount', mem.hands * 5000,
          'method', case when i % 5 = 0 then 'mtn_momo' when i % 7 = 0 then 'orange_money' else 'cash' end,
          'momo_ref', case when i % 5 = 0 then 'MP' || to_char(meeting_dates[k], 'YYMMDD') || '.' || lpad((1400 + i * 37)::text, 4, '0') end,
          'at', meeting_dates[k] + time '15:20');
      end if;
    end loop;
    perform public.sync_ops(ops);

    -- payout to this week's collector: the pot (17 hands x 5,000)
    for slot in select s.id, s.member_id from public.cycle_slots s where s.meeting_id = mid loop
      ops := jsonb_build_array(jsonb_build_object('type', 'payout', 'id', gen_random_uuid(), 'meeting_id', mid, 'slot_id', slot.id,
        'amount', 85000, 'method', 'cash', 'at', meeting_dates[k] + time '17:00'));
      perform public.sync_ops(ops);
      -- the first two collectors have confirmed on their private link
      if k < 3 then
        insert into public.payout_confirmations (payout_entry_id, group_id, member_id)
        select e.id, gid, slot.member_id from public.ledger_entries e where e.slot_id = slot.id and e.kind = 'payout';
      end if;
    end loop;

    perform public.sync_ops(jsonb_build_array(jsonb_build_object('type', 'close', 'id', gen_random_uuid(), 'meeting_id', mid,
      'minutes', case k
        when 1 then 'First meeting of the new cycle. Turn order drawn in front of everybody. Savings fund opened.'
        when 2 then 'Lucy Ekane asked for a loan of 100,000 for her shop. Agreed: 5% per month, 3 months. Guarantors Pa Joe and Ma Grace.'
        else 'Divine Tanyi announced the birth of his daughter. Collection of 2,000 per member agreed.' end)));
    perform public.apply_fine_rules(mid);
  end loop;

  -- some fines paid
  ops := '[]'::jsonb;
  for mem in select f.id, f.balance from public.fine_balances f where f.group_id = gid and f.balance > 0 order by f.created_at, f.member_name, f.type limit 3 loop
    ops := ops || jsonb_build_object('type', 'fine_payment', 'id', gen_random_uuid(), 'fine_id', mem.id, 'amount', mem.balance, 'method', 'cash');
  end loop;
  perform public.sync_ops(ops);

  -- one loan with two guarantors and a first repayment
  perform public.sync_ops(jsonb_build_array(
    jsonb_build_object('type', 'loan', 'id', loan_id, 'group_id', gid,
      'member_id', (select id from public.members where group_id = gid and name = 'Lucy Ekane'),
      'principal', 100000, 'rate', 5, 'basis', 'per_month', 'start_date', '2026-11-15', 'due_date', '2027-02-15', 'method', 'cash',
      'note', 'Shop stock', 'guarantors', jsonb_build_array(
        (select id from public.members where group_id = gid and name = 'Pa Joe Tabi'),
        (select id from public.members where group_id = gid and name = 'Ma Grace Awah')),
      'at', '2026-11-15T17:30:00+01'),
    jsonb_build_object('type', 'loan_repayment', 'id', gen_random_uuid(), 'loan_id', loan_id, 'amount', 20000,
      'method', 'mtn_momo', 'momo_ref', 'MP261122.2210', 'at', '2026-11-22T16:00:00+01')));

  -- birth collection for Divine: 2,000 each, he pays nothing; about half have paid
  perform public.create_event(event_id, gid, 'Birth of Divine''s daughter', 'birth', 2000, '2026-11-29',
    (select id from public.members where group_id = gid and name = 'Divine Tanyi'),
    (select jsonb_agg(jsonb_build_object('member_id', id, 'amount', 2000)) from public.members
     where group_id = gid and name <> 'Divine Tanyi'));
  select jsonb_agg(jsonb_build_object('type', 'event_payment', 'id', gen_random_uuid(), 'event_id', event_id,
                   'member_id', id, 'amount', 2000, 'method', 'cash'))
  into ops from (select id from public.members where group_id = gid and name <> 'Divine Tanyi' order by name limit 8) x;
  perform public.sync_ops(ops);

  -- a private link for every member
  perform public.reset_member_link(id) from public.members where group_id = gid;

  raise notice 'Unity Njangi created: %', gid;
end $$;
