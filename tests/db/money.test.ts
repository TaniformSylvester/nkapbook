import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Db, phone } from "./helpers";

let db: Db;
let pres: string;
let other: string;
let gid: string;
const m: Record<string, string> = {};
const at = () => new Date().toISOString();

const sync = async (ops: object[], who = pres) =>
  (await db.user(who).commit<{ r: { id: string; ok: boolean; error?: string }[] }>(`select public.sync_ops($1::jsonb) r`, [JSON.stringify(ops)]))[0]!.r;
const one = async <T,>(sql: string, params: unknown[] = [], who = pres) => (await db.user(who).q<T>(sql, params))[0]!;

beforeAll(async () => {
  db = await Db.connect();
  pres = await db.createUser(phone());
  other = await db.createUser(phone());
  gid = (await db.user(pres).commit<{ id: string }>(
    `select public.create_group('Unity Njangi', 'Bamenda', 'pcm', 'monthly', 5::smallint, 5000, '2026-01-05', 'Pa Joe') as id`))[0]!.id;
  await db.user(other).commit(`select public.create_group('Other', 'Buea', 'en', 'weekly', 0::smallint, 1000, null, 'Other')`);
  const rows = await db.user(pres).commit<{ id: string; name: string }>(
    `insert into public.members (group_id, name, hands) values ($1, 'Mary', 2), ($1, 'Grace', 1), ($1, 'Ayuk', 1) returning id, name`, [gid]);
  for (const r of rows) m[r.name] = r.id;
});
afterAll(async () => db?.end());

describe("loans", () => {
  const loan = randomUUID();

  it("5% per month for 3 months on 100,000 = 15,000 interest, shown up front", async () => {
    expect((await sync([{ type: "fund_deposit", id: randomUUID(), group_id: gid, member_id: m.Mary, amount: 200000, method: "cash", at: at() }]))[0]!.ok).toBe(true);
    const r = await sync([{
      type: "loan", id: loan, group_id: gid, member_id: m.Grace, principal: 100000, rate: 5, basis: "per_month",
      start_date: "2026-01-10", due_date: "2026-04-10", method: "cash", guarantors: [m.Mary, m.Ayuk, m.Grace], at: at(),
    }]);
    expect(r[0]!.ok).toBe(true);
    const b = await one<{ term_months: number; interest: number; owed_total: number; balance: number }>(
      `select term_months, interest, owed_total, balance from public.loan_balances where id = $1`, [loan]);
    expect(b).toEqual({ term_months: 3, interest: 15000, owed_total: 115000, balance: 115000 });
    const g = await db.user(pres).q(`select member_id from public.loan_guarantors where loan_id = $1`, [loan]);
    expect(g).toHaveLength(2); // the borrower can't guarantee their own loan
  });

  it("replaying the loan op does not lend twice", async () => {
    await sync([{ type: "loan", id: loan, group_id: gid, member_id: m.Grace, principal: 100000, rate: 5, basis: "per_month",
      start_date: "2026-01-10", due_date: "2026-04-10", method: "cash", at: at() }]);
    const n = await one<{ n: number }>(`select count(*)::int n from public.ledger_entries where loan_id = $1 and kind = 'loan_disbursed'`, [loan]);
    expect(n.n).toBe(1);
  });

  it("flat interest is charged once", async () => {
    const id = randomUUID();
    await sync([{ type: "loan", id, group_id: gid, member_id: m.Ayuk, principal: 50000, rate: 10, basis: "flat",
      start_date: "2026-01-10", due_date: "2026-07-10", method: "cash", at: at() }]);
    expect((await one<{ interest: number }>(`select interest from public.loan_balances where id = $1`, [id])).interest).toBe(5000);
  });

  it("is overdue after the due date, and becomes repaid when the balance reaches zero", async () => {
    await sync([{ type: "loan_repayment", id: randomUUID(), loan_id: loan, amount: 50000, method: "mtn_momo", at: at() }]);
    let b = await one<{ balance: number; overdue: boolean; status: string }>(`select balance, overdue, status from public.loan_balances where id = $1`, [loan]);
    expect(b).toEqual({ balance: 65000, overdue: true, status: "active" });
    await sync([{ type: "loan_repayment", id: randomUUID(), loan_id: loan, amount: 65000, method: "cash", at: at() }]);
    b = await one(`select balance, overdue, status from public.loan_balances where id = $1`, [loan]);
    expect(b).toEqual({ balance: 0, overdue: false, status: "repaid" });
  });

  it("extra interest needs a reason", async () => {
    const r = await sync([{ type: "loan_interest", id: randomUUID(), loan_id: loan, amount: 1000, reason: "", at: at() }]);
    expect(r[0]!.ok).toBe(false);
  });

  it("officials cannot change a loan's amount after the fact", async () => {
    await expect(db.user(pres).q(`update public.loans set principal = 1 where id = $1`, [loan])).rejects.toThrow(/permission denied/);
  });
});

describe("fines", () => {
  let mid: string;

  it("automatic rules fine late payers, absentees and latecomers, once each", async () => {
    await db.user(pres).commit(`insert into public.fine_rules (group_id, type, amount) values ($1, 'late_payment', 500), ($1, 'absence', 1000), ($1, 'lateness', 200)`, [gid]);
    mid = (await db.user(pres).commit<{ id: string }>(`select public.open_meeting($1, '2026-02-05') id`, [gid]))[0]!.id;
    await sync([
      { type: "payment", id: randomUUID(), meeting_id: mid, member_id: m.Mary, amount: 10000, method: "cash", at: at() },
      { type: "payment", id: randomUUID(), meeting_id: mid, member_id: m.Grace, amount: 2000, method: "cash", at: at() },
      { type: "payment", id: randomUUID(), meeting_id: mid, member_id: m.Ayuk, amount: 5000, method: "cash", at: at() },
      { type: "attendance", id: randomUUID(), meeting_id: mid, member_id: m.Ayuk, status: "absent", at: at() },
      { type: "attendance", id: randomUUID(), meeting_id: mid, member_id: m.Mary, status: "late", at: at() },
    ]);
    const n1 = await db.user(pres).commit<{ n: number }>(`select public.apply_fine_rules($1) n`, [mid]);
    // Grace (partly paid) + Pa Joe (unpaid) late payment, Ayuk absent, Mary late
    expect(n1[0]!.n).toBe(4);
    const n2 = await db.user(pres).commit<{ n: number }>(`select public.apply_fine_rules($1) n`, [mid]);
    expect(n2[0]!.n).toBe(0);
    const fines = await db.user(pres).q<{ member_name: string; type: string; balance: number }>(
      `select member_name, type, balance from public.fine_balances where meeting_id = $1 order by member_name`, [mid]);
    expect(fines.map((f) => `${f.member_name}:${f.type}:${f.balance}`)).toEqual([
      "Ayuk:absence:1000", "Grace:late_payment:500", "Mary:lateness:200", "Pa Joe:late_payment:500",
    ]);
  });

  it("a fine can be paid, or waived with a reason (as a correction)", async () => {
    const [grace] = await db.user(pres).q<{ id: string }>(`select id from public.fine_balances where member_name = 'Grace'`);
    const [mary] = await db.user(pres).q<{ id: string; charge_entry_id: string }>(`select id, charge_entry_id from public.fine_balances where member_name = 'Mary'`);
    const r = await sync([
      { type: "fine_payment", id: randomUUID(), fine_id: grace!.id, amount: 500, method: "cash", at: at() },
      { type: "reverse", id: randomUUID(), reverses: mary!.charge_entry_id, reason: "Taxi broke down, group agreed", at: at() },
    ]);
    expect(r.every((x) => x.ok)).toBe(true);
    const b = await db.user(pres).q<{ member_name: string; balance: number }>(
      `select member_name, balance from public.fine_balances where id in ($1, $2) order by member_name`, [grace!.id, mary!.id]);
    expect(b.map((x) => x.balance)).toEqual([0, 0]);
  });

  it("a manual fine (misconduct) is recorded with its note; a fine without a type is rejected whole", async () => {
    const id = randomUUID();
    const r = await sync([
      { type: "fine", id, group_id: gid, member_id: m.Ayuk, fine_type: "misconduct", amount: 2000, note: "Insulted the treasurer", at: at() },
      { type: "fine", id: randomUUID(), group_id: gid, member_id: m.Ayuk, amount: 2000, at: at() },
    ]);
    expect(r.map((x) => x.ok)).toEqual([true, false]);
    const f = await one<{ type: string; note: string; balance: number }>(`select type, note, balance from public.fine_balances where id = $1`, [id]);
    expect(f).toEqual({ type: "misconduct", note: "Insulted the treasurer", balance: 2000 });
  });
});

describe("events, fund and balances", () => {
  const ev = randomUUID();

  it("event: dues per member, payments, payout to the member it is for", async () => {
    await db.user(pres).commit(`select public.create_event($1, $2, 'Death of Grace''s father', 'death', 3000, '2026-03-01', $3, $4::jsonb)`,
      [ev, gid, m.Grace, JSON.stringify([{ member_id: m.Mary, amount: 6000 }, { member_id: m.Ayuk, amount: 3000 }])]);
    const r = await sync([
      { type: "event_payment", id: randomUUID(), event_id: ev, member_id: m.Mary, amount: 6000, method: "cash", at: at() },
      { type: "event_payout", id: randomUUID(), event_id: ev, amount: 6000, method: "cash", at: at() },
    ]);
    expect(r.every((x) => x.ok)).toBe(true);
    const rows = await db.user(pres).q<{ member_name: string; due: number; paid: number }>(
      `select member_name, due, paid from public.event_balances where event_id = $1 order by member_name`, [ev]);
    expect(rows).toEqual([{ member_name: "Ayuk", due: 3000, paid: 0 }, { member_name: "Mary", due: 6000, paid: 6000 }]);
  });

  it("fund balance is cash only: deposits + repayments + fines paid − loans out", async () => {
    const a = await one<{ fund_balance: number; social_balance: number }>(`select fund_balance, social_balance from public.group_accounts where group_id = $1`, [gid]);
    // 200,000 deposit − 100,000 − 50,000 loans + 115,000 repaid + 500 fine paid
    expect(a.fund_balance).toBe(165500);
    expect(a.social_balance).toBe(0);
  });

  it("member balances add up per member", async () => {
    const ayuk = await one<{ loans_owing: number; fines_owing: number; events_owing: number }>(
      `select loans_owing, fines_owing, events_owing from public.member_balances where member_id = $1`, [m.Ayuk]);
    expect(ayuk).toEqual({ loans_owing: 55000, fines_owing: 3000, events_owing: 3000 });
  });

  it("another group's official sees none of it and can't write to it", async () => {
    expect(await db.user(other).q(`select * from public.member_balances where group_id = $1`, [gid])).toHaveLength(0);
    expect(await db.user(other).q(`select * from public.loan_balances where group_id = $1`, [gid])).toHaveLength(0);
    expect(await db.user(other).q(`select * from public.group_accounts where group_id = $1`, [gid])).toHaveLength(0);
    const r = await sync([
      { type: "fund_withdrawal", id: randomUUID(), group_id: gid, amount: 1000, method: "cash", at: at() },
      { type: "fine", id: randomUUID(), group_id: gid, member_id: m.Mary, fine_type: "custom", amount: 1000, at: at() },
    ], other);
    expect(r.map((x) => x.ok)).toEqual([false, false]);
    await expect(db.user(other).q(`select public.apply_fine_rules(id) from public.meetings where group_id = $1`, [gid])).resolves.toHaveLength(0);
  });

  it("the browser's anonymous role cannot read the views", async () => {
    await expect(db.as({ role: "anon" }, `select * from public.member_balances`)).rejects.toThrow(/permission denied/);
  });
});
