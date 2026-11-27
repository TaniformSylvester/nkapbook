import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Db, phone } from "./helpers";

let db: Db;
let pres: string;
let gid: string;
let mary: string;
let peter: string;
let peterPhone: string;
let maryToken: string;
let peterToken: string;
let maryPayout: string;
let peterPayout: string;

type View = {
  status: string;
  member: { name: string };
  totals: { paid: number; contribution_owing: number; received: number };
  payouts: { id: string; confirmed_at: string | null }[];
  history: { kind: string; amount: number; correction: boolean; reason: string | null; corrected: boolean }[];
};
const view = async (token: string, ip = "10.0.0.1") =>
  (await db.as<{ v: View }>({ role: "service_role" }, `select public.member_view($1, $2) v`, [token, ip], true))[0]!.v;
const confirm = async (token: string, entry: string) =>
  (await db.as<{ r: string }>({ role: "service_role" }, `select public.confirm_payout($1, $2, '10.0.0.1') r`, [token, entry], true))[0]!.r;

beforeAll(async () => {
  db = await Db.connect();
  pres = await db.createUser(phone());
  gid = (await db.user(pres).commit<{ id: string }>(
    `select public.create_group('Unity Njangi', 'Bamenda', 'pcm', 'monthly', 5::smallint, 5000, '2026-01-05', 'Pa Joe') as id`))[0]!.id;
  peterPhone = phone();
  const rows = await db.user(pres).commit<{ id: string; name: string }>(
    `insert into public.members (group_id, name, phone, hands) values ($1, 'Mary Ndi', $2, 2), ($1, 'Peter Secret', $3, 1) returning id, name`,
    [gid, phone(), peterPhone]);
  mary = rows.find((r) => r.name === "Mary Ndi")!.id;
  peter = rows.find((r) => r.name === "Peter Secret")!.id;
  const mid = (await db.user(pres).commit<{ id: string }>(`select public.open_meeting($1, '2026-01-05') id`, [gid]))[0]!.id;
  const at = new Date().toISOString();
  const wrong = randomUUID();
  maryPayout = randomUUID();
  peterPayout = randomUUID();
  await db.user(pres).commit(`select public.sync_ops($1::jsonb)`, [JSON.stringify([
    { type: "payment", id: randomUUID(), meeting_id: mid, member_id: mary, amount: 6000, method: "cash", at },
    { type: "payment", id: wrong, meeting_id: mid, member_id: mary, amount: 9000, method: "cash", at },
    { type: "reverse", id: randomUUID(), reverses: wrong, reason: "Recorded twice", at },
    { type: "payment", id: randomUUID(), meeting_id: mid, member_id: peter, amount: 5000, method: "mtn_momo", at },
  ])]);
  for (const [id, member] of [[maryPayout, mary], [peterPayout, peter]] as const) {
    await db.user(pres).commit(
      `insert into public.ledger_entries (id, group_id, member_id, meeting_id, kind, amount, method, recorded_by)
       values ($1, $2, $3, $4, 'payout', 15000, 'cash', $5)`, [id, gid, member, mid, pres]);
  }
  maryToken = (await db.user(pres).commit<{ t: string }>(`select public.reset_member_link($1) t`, [mary]))[0]!.t;
  peterToken = (await db.user(pres).commit<{ t: string }>(`select public.reset_member_link($1) t`, [peter]))[0]!.t;
});
afterAll(async () => db?.end());

describe("member link", () => {
  it("shows the member their own totals and history, including corrections with the reason", async () => {
    const v = await view(maryToken);
    expect(v.status).toBe("ok");
    expect(v.member.name).toBe("Mary Ndi");
    expect(v.totals.paid).toBe(6000);
    expect(v.totals.contribution_owing).toBe(4000);
    expect(v.totals.received).toBe(15000);
    const fix = v.history.find((h) => h.correction)!;
    expect(fix.reason).toBe("Recorded twice");
    expect(v.history.find((h) => h.amount === 9000 && !h.correction)!.corrected).toBe(true);
  });

  it("a member link cannot read another member", async () => {
    const raw = JSON.stringify(await view(maryToken));
    expect(raw).not.toContain(peter);
    expect(raw).not.toContain("Peter");
    expect(raw).not.toContain(peterPhone);
    expect(raw).not.toContain(peterPayout);
    const pv = await view(peterToken);
    expect(pv.member.name).toBe("Peter Secret");
    expect(pv.totals.paid).toBe(5000);
  });

  it("a member cannot confirm someone else's payout", async () => {
    expect(await confirm(maryToken, peterPayout)).toBe("not_found");
    const conf = await db.admin(`select * from public.payout_confirmations where payout_entry_id = $1`, [peterPayout]);
    expect(conf).toHaveLength(0);
  });

  it("a member confirms their own payout once; officials see it", async () => {
    expect(await confirm(maryToken, maryPayout)).toBe("ok");
    expect(await confirm(maryToken, maryPayout)).toBe("ok");
    const v = await view(maryToken);
    expect(v.payouts.find((p) => p.id === maryPayout)!.confirmed_at).not.toBeNull();
    const seen = await db.user(pres).q(`select * from public.payout_confirmations where payout_entry_id = $1`, [maryPayout]);
    expect(seen).toHaveLength(1);
    await expect(db.admin(`delete from public.payout_confirmations where payout_entry_id = $1`, [maryPayout])).rejects.toThrow(/cannot be edited/);
  });

  it("a reset link stops working", async () => {
    const old = maryToken;
    maryToken = (await db.user(pres).commit<{ t: string }>(`select public.reset_member_link($1) t`, [mary]))[0]!.t;
    expect((await view(old)).status).toBe("revoked");
    expect(await confirm(old, maryPayout)).toBe("not_found");
    expect((await view(maryToken)).status).toBe("ok");
  });

  it("unknown or malformed tokens find nothing", async () => {
    expect((await view("x".repeat(43))).status).toBe("not_found");
    expect((await view("'; drop table members; --")).status).toBe("not_found");
  });

  it("browsers cannot call the member functions directly, signed in or not", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(db.as({ role, userId: pres }, `select public.member_view($1, 'x')`, [maryToken])).rejects.toThrow(/permission denied/);
      await expect(db.as({ role, userId: pres }, `select public.confirm_payout($1, $2, 'x')`, [maryToken, maryPayout])).rejects.toThrow(/permission denied/);
    }
  });

  it("is rate-limited per visitor", async () => {
    let last = "";
    for (let i = 0; i < 125; i++) last = (await view(maryToken, "203.0.113.9")).status;
    expect(last).toBe("rate_limited");
    expect((await view(maryToken, "203.0.113.10")).status).toBe("ok");
  });

  it("opening the page is not written to the audit log each time", async () => {
    const n = await db.admin<{ n: number }>(
      `select count(*)::int n from public.audit_log where table_name = 'member_links' and action = 'update' and group_id = $1`, [gid]);
    // only the revocations from resets, not the hundreds of opens
    expect(n[0]!.n).toBeLessThan(5);
  });
});
