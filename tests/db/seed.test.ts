import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Db, phone } from "./helpers";

// Keeps supabase/seed/demo_unity_njangi.sql working as the schema evolves.
let db: Db;
let gid: string;
beforeAll(async () => {
  db = await Db.connect();
  const p = phone();
  await db.createUser(p);
  const sql = readFileSync(path.resolve(import.meta.dirname, "../../supabase/seed/demo_unity_njangi.sql"), "utf8")
    .replace("'237670000001'", `'${p}'`);
  await db.admin(sql);
  await db.admin(sql); // second run must do nothing
  gid = (await db.admin<{ id: string }>(
    `select g.id from public.groups g join public.members m on m.group_id = g.id join auth.users u on u.id = m.user_id
     where g.name = 'Unity Njangi' and u.phone = $1`, [p]))[0]!.id;
});
afterAll(async () => db?.end());

describe("demo seed", () => {
  it("creates one realistic group: 15 members, 2 with double hands, partial payments, one loan", async () => {
    const [r] = await db.admin<Record<string, number>>(`select
      (select count(*)::int from public.members where group_id = $1) members,
      (select count(*)::int from public.members where group_id = $1 and hands = 2) doubles,
      (select count(*)::int from public.meetings where group_id = $1 and status = 'closed') meetings,
      (select count(*)::int from public.loans where group_id = $1) loans,
      (select count(*)::int from public.member_balances where group_id = $1 and contribution_owing > 0) owing,
      (select count(*)::int from public.member_links where group_id = $1 and revoked_at is null) links,
      (select count(*)::int from public.members where group_id = $1 and phone is not null) phones,
      (select fund_balance from public.group_accounts where group_id = $1) fund`, [gid]);
    expect(r).toMatchObject({ members: 15, doubles: 2, meetings: 3, loans: 1, links: 15, phones: 1 });
    // 150,000 savings - 100,000 loan + 20,000 repaid + the 3 fines paid
    const [paid] = await db.admin<{ n: number }>(`select coalesce(sum(net), 0)::int n from public.ledger_net where group_id = $1 and kind = 'fine_paid'`, [gid]);
    expect(r!.fund).toBe(70000 + paid!.n);
    expect(r!.owing).toBeGreaterThan(0);
  });
});
