import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Db, phone } from "./helpers";

let db: Db;
let pres: string;
let sec: string;
let secPhone: string;
let group: string;
let secMember: string;
let mary: string;

const createGroup = `select public.create_group('Unity Njangi', 'Buea', 'en', 'weekly', 0::smallint, 5000, null, 'Pa Joe') as id`;
const invite = `insert into public.official_invites (group_id, member_id, phone, role, invited_by)
                values ($1, $2, $3, $4, $5) returning id`;

beforeAll(async () => {
  db = await Db.connect();
  pres = await db.createUser(phone());
  secPhone = phone();
  sec = await db.createUser(secPhone);
  group = (await db.user(pres).commit<{ id: string }>(createGroup))[0]!.id;
  const rows = await db.user(pres).commit<{ id: string; name: string }>(
    `insert into public.members (group_id, name, phone, hands) values
       ($1, 'Mary Ndi', $2, 2), ($1, 'Ma Grace', $3, 1) returning id, name`,
    [group, phone(), secPhone],
  );
  mary = rows.find((r) => r.name === "Mary Ndi")!.id;
  secMember = rows.find((r) => r.name === "Ma Grace")!.id;
});

afterAll(async () => db?.end());

describe("members", () => {
  it("officials can add several members at once", async () => {
    const n = await db.user(pres).q<{ n: number }>(
      `select count(*)::int n from public.members where group_id = $1`,
      [group],
    );
    expect(n[0]!.n).toBe(3); // president + 2
  });

  it("marking a member as left records the date, and coming back clears it", async () => {
    const left = await db.user(pres).commit<{ left_at: string | null }>(
      `update public.members set status = 'left' where id = $1 returning left_at::text`,
      [mary],
    );
    expect(left[0]!.left_at).not.toBeNull();
    const back = await db.user(pres).commit<{ left_at: string | null }>(
      `update public.members set status = 'active' where id = $1 returning left_at`,
      [mary],
    );
    expect(back[0]!.left_at).toBeNull();
  });
});

describe("invites", () => {
  it("an invite must name a member of the group", async () => {
    await expect(db.user(pres).q(invite, [group, null, phone(), "secretary", pres])).rejects.toThrow(/must name a member/);
  });

  it("a cancelled invite is not accepted at sign-in", async () => {
    const id = (await db.user(pres).commit<{ id: string }>(invite, [group, secMember, secPhone, "secretary", pres]))[0]!.id;
    // only the president can cancel
    const none = await db.user(sec).q(`update public.official_invites set cancelled_at = now(), cancelled_by = $2 where id = $1 returning id`, [id, sec]);
    expect(none).toHaveLength(0);
    // and only the cancel columns
    await expect(
      db.user(pres).q(`update public.official_invites set role = 'president' where id = $1`, [id]),
    ).rejects.toThrow(/permission denied/);
    await db.user(pres).commit(`update public.official_invites set cancelled_at = now(), cancelled_by = $2 where id = $1`, [id, pres]);
    const accepted = await db.user(sec).commit<{ n: number }>(`select public.accept_invites() as n`);
    expect(accepted[0]!.n).toBe(0);
    expect(await db.user(sec).q(`select id from public.groups`)).toHaveLength(0);
  });

  it("a fresh invite is accepted and gives access", async () => {
    await db.user(pres).commit(invite, [group, secMember, secPhone, "secretary", pres]);
    const accepted = await db.user(sec).commit<{ n: number }>(`select public.accept_invites() as n`);
    expect(accepted[0]!.n).toBe(1);
    const me = await db.user(sec).q<{ role: string; name: string }>(
      `select role, name from public.members where user_id = $1`,
      [sec],
    );
    expect(me).toEqual([{ role: "secretary", name: "Ma Grace" }]);
  });
});

describe("the group always has a president", () => {
  it("the only president cannot step down or leave", async () => {
    await expect(
      db.user(pres).q(`update public.members set role = 'member' where user_id = $1 and group_id = $2`, [pres, group]),
    ).rejects.toThrow(/needs a president/);
    await expect(
      db.user(pres).q(`update public.members set status = 'left' where user_id = $1 and group_id = $2`, [pres, group]),
    ).rejects.toThrow(/needs a president/);
  });

  it("an invite that would demote the only president is skipped, and sign-in still works", async () => {
    const presMember = (await db.admin<{ id: string; phone: string }>(
      `select m.id, u.phone from public.members m join auth.users u on u.id = m.user_id where m.user_id = $1`,
      [pres],
    ))[0]!;
    await db.user(pres).commit(invite, [group, presMember.id, presMember.phone, "treasurer", pres]);
    const n = await db.user(pres).commit<{ n: number }>(`select public.accept_invites() as n`);
    expect(n[0]!.n).toBe(0);
    const role = await db.user(pres).q<{ role: string }>(`select role from public.members where id = $1`, [presMember.id]);
    expect(role[0]!.role).toBe("president");
  });

  it("after handing over to another president, the old one can step down", async () => {
    await db.user(pres).commit(`update public.members set role = 'president' where id = $1`, [secMember]);
    const r = await db.user(pres).commit<{ role: string }>(
      `update public.members set role = 'treasurer' where user_id = $1 and group_id = $2 returning role`,
      [pres, group],
    );
    expect(r[0]!.role).toBe("treasurer");
  });
});
