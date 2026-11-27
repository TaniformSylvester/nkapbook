import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomUUID } from "node:crypto";
import { Db, phone } from "./helpers";

let db: Db;
let pres: string;
let other: string; // official of another group
let gid: string;
let otherGid: string;
const m: Record<string, string> = {};

type Snap = {
  meeting: { id: string; status: string };
  collectors: { slot_id: string; member_id: string; name: string; payouts: { id: string; amount: number }[] }[];
  members: { id: string; name: string; due_today: number; paid_today: number; owing_before: number; attendance: string | null;
    payments: { id: string; amount: number; reversed: boolean }[] }[];
};

const snap = async (mid: string, who = pres) =>
  (await db.user(who).q<{ s: Snap }>(`select public.meeting_snapshot($1) s`, [mid]))[0]!.s;
const sync = async (ops: object[], who = pres) =>
  (await db.user(who).commit<{ r: { id: string; ok: boolean; error?: string }[] }>(`select public.sync_ops($1::jsonb) r`, [JSON.stringify(ops)]))[0]!.r;
const member = (s: Snap, name: string) => s.members.find((x) => x.name === name)!;

beforeAll(async () => {
  db = await Db.connect();
  pres = await db.createUser(phone());
  other = await db.createUser(phone());
  gid = (await db.user(pres).commit<{ id: string }>(
    `select public.create_group('Unity Njangi', 'Bamenda', 'pcm', 'monthly', 5::smallint, 5000, '2026-01-05', 'Pa Joe') as id`))[0]!.id;
  otherGid = (await db.user(other).commit<{ id: string }>(
    `select public.create_group('Other', 'Buea', 'en', 'weekly', 0::smallint, 1000, null, 'Other') as id`))[0]!.id;
  const rows = await db.user(pres).commit<{ id: string; name: string }>(
    `insert into public.members (group_id, name, hands) values ($1, 'Mary', 2), ($1, 'Grace', 1) returning id, name`, [gid]);
  for (const r of rows) m[r.name] = r.id;
  m["Pa Joe"] = (await db.user(pres).q<{ id: string }>(`select id from public.members where user_id = $1`, [pres]))[0]!.id;
});
afterAll(async () => db?.end());

describe("turn order", () => {
  let cycle: string;

  it("a manual order must list every hand exactly once", async () => {
    const bad = [{ member_id: m.Mary, hand_no: 1 }, { member_id: m.Grace, hand_no: 1 }];
    await expect(db.user(pres).q(`select public.create_cycle($1, 'manual', '2026-01-05', $2::jsonb)`, [gid, JSON.stringify(bad)]))
      .rejects.toThrow(/every hand exactly once/);
  });

  it("a draw is recorded with its seed, and anyone can recompute the order from it", async () => {
    cycle = (await db.user(pres).commit<{ id: string }>(
      `select public.create_cycle($1, 'draw', '2026-01-05', null, 'Drawn at the meeting, all present') as id`, [gid]))[0]!.id;
    const [draw] = await db.user(pres).q<{ seed: string; result: { position: number; member_id: string; hand_no: number }[]; drawn_by: string; witness_note: string }>(
      `select seed, result, drawn_by, witness_note from public.cycle_draws where cycle_id = $1`, [cycle]);
    expect(draw!.drawn_by).toBe(pres);
    expect(draw!.result).toHaveLength(4); // Mary x2, Grace, Pa Joe
    const hands = draw!.result.map((r) => ({ member_id: r.member_id, hand_no: r.hand_no }));
    const key = (h: { member_id: string; hand_no: number }) =>
      createHash("sha256").update(`${draw!.seed}:${h.member_id}:${h.hand_no}`).digest("hex");
    const recomputed = [...hands].sort((a, b) => (key(a) < key(b) ? -1 : 1));
    expect(recomputed).toEqual(hands);
    const slots = await db.user(pres).q<{ planned_date: string }>(
      `select planned_date::text from public.cycle_slots where cycle_id = $1 order by position`, [cycle]);
    expect(slots.map((s) => s.planned_date)).toEqual(["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05"]);
  });

  it("a redraw keeps the first draw on record", async () => {
    await db.user(pres).commit(`select public.reorder_cycle($1, 'draw', null, null, 'Redraw: Grace arrived late')`, [cycle]);
    const draws = await db.user(pres).q(`select id from public.cycle_draws where cycle_id = $1`, [cycle]);
    expect(draws).toHaveLength(2);
  });

  it("officials cannot edit slots or draws directly", async () => {
    await expect(db.user(pres).q(`update public.cycle_slots set position = 99 where cycle_id = $1`, [cycle])).rejects.toThrow(/permission denied/);
    await expect(db.user(pres).q(`delete from public.cycle_draws where cycle_id = $1`, [cycle])).rejects.toThrow(/permission denied/);
    await expect(db.user(other).q(`select public.reorder_cycle($1, 'draw', null)`, [cycle])).rejects.toThrow(/not allowed/);
  });

  it("set a manual order, start it, then the order is locked", async () => {
    const order = [
      { member_id: m.Grace, hand_no: 1 }, { member_id: m.Mary, hand_no: 1 },
      { member_id: m["Pa Joe"], hand_no: 1 }, { member_id: m.Mary, hand_no: 2 },
    ];
    await db.user(pres).commit(`select public.reorder_cycle($1, 'manual', null, $2::jsonb)`, [cycle, JSON.stringify(order)]);
    await db.user(pres).commit(`select public.start_cycle($1)`, [cycle]);
    await expect(db.user(pres).q(`select public.reorder_cycle($1, 'draw', null)`, [cycle])).rejects.toThrow(/locked/);
    await expect(db.user(pres).q(`select public.create_cycle($1, 'draw', '2027-01-01')`, [gid])).rejects.toThrow(/cycles_one_open/);
  });
});

describe("meetings and offline sync", () => {
  let m1: string;
  let m2: string;
  const p1 = randomUUID();

  it("opening a meeting records dues (hands × amount) and today's collector", async () => {
    m1 = (await db.user(pres).commit<{ id: string }>(`select public.open_meeting($1, '2026-01-05', $2) id`, [gid, randomUUID()]))[0]!.id;
    const s = await snap(m1);
    expect(member(s, "Mary").due_today).toBe(10000);
    expect(member(s, "Grace").due_today).toBe(5000);
    expect(s.collectors.map((c) => c.name)).toEqual(["Grace"]);
  });

  it("opening the same day again returns the same meeting (no double dues)", async () => {
    const again = (await db.user(pres).commit<{ id: string }>(`select public.open_meeting($1, '2026-01-05', $2) id`, [gid, randomUUID()]))[0]!.id;
    expect(again).toBe(m1);
    expect(member(await snap(m1), "Mary").due_today).toBe(10000);
  });

  it("replaying the same offline batch never records twice", async () => {
    const at = new Date().toISOString();
    const ops = [
      { type: "attendance", id: randomUUID(), meeting_id: m1, member_id: m.Mary, status: "present", at },
      { type: "payment", id: p1, meeting_id: m1, member_id: m.Mary, amount: 6000, method: "cash", at },
      { type: "payment", id: randomUUID(), meeting_id: m1, member_id: m.Grace, amount: 5000, method: "mtn_momo", momo_ref: "MP2601.1234", at },
    ];
    expect((await sync(ops)).every((r) => r.ok)).toBe(true);
    expect((await sync(ops)).every((r) => r.ok)).toBe(true);
    const s = await snap(m1);
    expect(member(s, "Mary").paid_today).toBe(6000);
    expect(member(s, "Mary").attendance).toBe("present");
    expect(member(s, "Grace").paid_today).toBe(5000);
  });

  it("attendance: the latest change wins, even if it syncs first", async () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    const earlier = new Date(Date.now() - 60_000).toISOString();
    await sync([{ type: "attendance", id: randomUUID(), meeting_id: m1, member_id: m.Grace, status: "late", at: later }]);
    await sync([{ type: "attendance", id: randomUUID(), meeting_id: m1, member_id: m.Grace, status: "absent", at: earlier }]);
    expect(member(await snap(m1), "Grace").attendance).toBe("late");
  });

  it("a correction reverses the entry with a reason, and only once", async () => {
    const wrong = randomUUID();
    const at = new Date().toISOString();
    await sync([{ type: "payment", id: wrong, meeting_id: m1, member_id: m["Pa Joe"], amount: 50000, method: "cash", at }]);
    const r1 = await sync([{ type: "reverse", id: randomUUID(), reverses: wrong, reason: "Typed 50,000 instead of 5,000", at },
                           { type: "payment", id: randomUUID(), meeting_id: m1, member_id: m["Pa Joe"], amount: 5000, method: "cash", at }]);
    expect(r1.every((r) => r.ok)).toBe(true);
    const r2 = await sync([{ type: "reverse", id: randomUUID(), reverses: wrong, reason: "again", at }]);
    expect(r2[0]!.ok).toBe(false);
    const pj = member(await snap(m1), "Pa Joe");
    expect(pj.paid_today).toBe(5000);
    expect(pj.payments.find((p) => p.id === wrong)?.reversed).toBe(true);
  });

  it("one bad op does not block the others", async () => {
    const r = await sync([
      { type: "payment", id: randomUUID(), meeting_id: m1, member_id: m.Grace, amount: -5, method: "cash", at: new Date().toISOString() },
      { type: "attendance", id: randomUUID(), meeting_id: m1, member_id: m["Pa Joe"], status: "present", at: new Date().toISOString() },
    ]);
    expect(r.map((x) => x.ok)).toEqual([false, true]);
  });

  it("an official of another group cannot sync into this meeting or read it", async () => {
    const r = await sync([{ type: "payment", id: randomUUID(), meeting_id: m1, member_id: m.Mary, amount: 1000, method: "cash", at: new Date().toISOString() }], other);
    expect(r[0]!.ok).toBe(false);
    const s = await snap(m1, other);
    expect(s).toBeNull();
    await expect(db.user(other).q(`select public.open_meeting($1, '2026-02-05')`, [gid])).rejects.toThrow(/not allowed/);
  });

  it("payout goes to today's collector only, and is recorded", async () => {
    const s = await snap(m1);
    const slot = s.collectors[0]!.slot_id;
    const r = await sync([{ type: "payout", id: randomUUID(), meeting_id: m1, slot_id: slot, amount: 20000, method: "cash", at: new Date().toISOString() }]);
    expect(r[0]!.ok).toBe(true);
    const after = await snap(m1);
    expect(after.collectors[0]!.payouts[0]!.amount).toBe(20000);
  });

  it("balances carry forward: Mary paid 6,000 of 10,000, so she owes 4,000 at the next meeting", async () => {
    await sync([{ type: "close", id: randomUUID(), meeting_id: m1, minutes: "Good meeting." }]);
    expect((await snap(m1)).meeting.status).toBe("closed");
    m2 = (await db.user(pres).commit<{ id: string }>(`select public.open_meeting($1, '2026-02-05') id`, [gid]))[0]!.id;
    const s = await snap(m2);
    expect(member(s, "Mary").owing_before).toBe(4000);
    expect(member(s, "Grace").owing_before).toBe(0);
    expect(s.collectors.map((c) => c.name)).toEqual(["Mary"]);
  });

  it("meeting mode carries unpaid fines and active loans, and collects them offline-style", async () => {
    const fine = randomUUID();
    const loan = randomUUID();
    const at = new Date().toISOString();
    await sync([
      { type: "fund_deposit", id: randomUUID(), group_id: gid, amount: 100000, method: "cash", at },
      { type: "fine", id: fine, group_id: gid, member_id: m.Mary, fine_type: "misconduct", amount: 1000, at },
      { type: "loan", id: loan, group_id: gid, member_id: m.Mary, principal: 50000, rate: 0, basis: "per_month",
        start_date: "2026-02-01", due_date: "2026-05-01", method: "cash", at },
    ]);
    let mary = member(await snap(m2), "Mary") as unknown as { fines: { id: string; balance: number }[]; loans: { id: string; balance: number }[] };
    expect(mary.fines.map((f) => f.balance)).toEqual([1000]);
    expect(mary.loans.map((l) => l.balance)).toEqual([50000]);
    const pay = randomUUID();
    const r = await sync([
      { type: "fine_payment", id: pay, meeting_id: m2, fine_id: fine, amount: 1000, method: "cash", at },
      { type: "loan_repayment", id: randomUUID(), meeting_id: m2, loan_id: loan, amount: 20000, method: "mtn_momo", at },
    ]);
    expect(r.every((x) => x.ok)).toBe(true);
    const s = await snap(m2) as unknown as { entry_ids: string[]; members: { name: string; fines: unknown[]; loans: { balance: number }[]; fines_paid_today: number; loans_paid_today: number }[] };
    const mm = s.members.find((x) => x.name === "Mary")!;
    expect(mm.fines).toHaveLength(0);
    expect(mm.loans[0]!.balance).toBe(30000);
    expect(mm.fines_paid_today).toBe(1000);
    expect(mm.loans_paid_today).toBe(20000);
    expect(s.entry_ids).toContain(pay);
    void mary;
  });

  it("sharing a member's link creates it once and records when it was shared; other groups can't", async () => {
    const t1 = (await db.user(pres).commit<{ t: string }>(`select public.share_member_link($1) t`, [m.Grace]))[0]!.t;
    const t2 = (await db.user(pres).commit<{ t: string }>(`select public.share_member_link($1) t`, [m.Grace]))[0]!.t;
    expect(t2).toBe(t1);
    const [l] = await db.user(pres).q<{ shared_at: string | null }>(`select shared_at from public.member_links where member_id = $1 and revoked_at is null`, [m.Grace]);
    expect(l!.shared_at).not.toBeNull();
    await expect(db.user(other).q(`select public.share_member_link($1)`, [m.Grace])).rejects.toThrow(/not allowed/);
  });

  it("the ledger rows written by sync are still impossible to edit", async () => {
    await expect(db.user(pres).q(`update public.ledger_entries set amount = 1 where id = $1`, [p1])).rejects.toThrow(/permission denied|cannot be edited/);
  });
});
