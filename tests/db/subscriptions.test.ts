import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Db, phone } from "./helpers";

let db: Db;
let pres: string;
let other: string;
let admin: string;
let gid: string;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Douala" });
const addMonths = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + n);
  return x.toISOString().slice(0, 10);
};

beforeAll(async () => {
  db = await Db.connect();
  pres = await db.createUser(phone());
  other = await db.createUser(phone());
  admin = await db.createUser(phone());
  await db.admin(`insert into public.platform_admins (user_id) values ($1)`, [admin]);
  gid = (await db.user(pres).commit<{ id: string }>(
    `select public.create_group('Unity Njangi', 'Bamenda', 'pcm', 'weekly', 0::smallint, 5000, null, 'Pa Joe') as id`))[0]!.id;
  await db.user(other).commit(`select public.create_group('Other', 'Buea', 'en', 'weekly', 0::smallint, 1000, null, 'Other')`);
  // these first tests start from a group with no trial or paid period
  await db.admin(`update public.groups set plan = 'pilot', paid_until = null where id = $1`, [gid]);
});
afterAll(async () => db?.end());

describe("subscriptions", () => {
  it("only the platform admin can record a payment or change the end date", async () => {
    await expect(db.user(pres).q(`select public.admin_record_subscription($1, 1, 2000, 'mtn_momo', 'MP1')`, [gid])).rejects.toThrow(/not allowed/);
    await expect(db.user(pres).q(`update public.groups set paid_until = '2099-01-01' where id = $1`, [gid])).rejects.toThrow(/platform admin/);
    await expect(db.user(pres).q(`insert into public.subscription_payments (group_id, months, amount, method, paid_until_after) values ($1, 1, 1, 'cash', '2099-01-01')`, [gid])).rejects.toThrow(/permission denied/);
  });

  it("a payment starts from today when there is no paid period, and sets the plan to paid", async () => {
    const r = await db.user(admin).commit<{ d: string }>(`select public.admin_record_subscription($1, 1, 2000, 'mtn_momo', 'MP261127.1000')::text d`, [gid]);
    expect(r[0]!.d).toBe(addMonths(today(), 1));
    const g = await db.user(pres).q<{ plan: string; paid_until: string }>(`select plan, paid_until::text from public.groups where id = $1`, [gid]);
    expect(g[0]).toEqual({ plan: "paid", paid_until: addMonths(today(), 1) });
  });

  it("paying early adds to the end date instead of losing days", async () => {
    const r = await db.user(admin).commit<{ d: string }>(`select public.admin_record_subscription($1, 3, 6000, 'orange_money')::text d`, [gid]);
    expect(r[0]!.d).toBe(addMonths(addMonths(today(), 1), 3));
  });

  it("officials see their own group's payments, not others'; payments can't be edited", async () => {
    expect(await db.user(pres).q(`select * from public.subscription_payments where group_id = $1`, [gid])).toHaveLength(2);
    expect(await db.user(other).q(`select * from public.subscription_payments where group_id = $1`, [gid])).toHaveLength(0);
    await expect(db.admin(`update public.subscription_payments set amount = 1 where group_id = $1`, [gid])).rejects.toThrow(/cannot be edited/);
  });

  it("the admin overview shows the end date", async () => {
    const r = await db.user(admin).q<{ paid_until: string }>(`select paid_until::text from public.admin_overview() where id = $1`, [gid]);
    expect(r[0]!.paid_until).toBe(addMonths(addMonths(today(), 1), 3));
  });
});

describe("free trial and pausing new meetings", () => {
  let tg: string;
  let tp: string;
  const setEnd = (days: number) => db.admin(
    `update public.groups set paid_until = (now() at time zone 'Africa/Douala')::date + $2::int where id = $1`, [tg, days]);

  beforeAll(async () => {
    tp = await db.createUser(phone());
    tg = (await db.user(tp).commit<{ id: string }>(
      `select public.create_group('Trial Njangi', 'Buea', 'en', 'weekly', 0::smallint, 2000, null, 'Ma Rose') id`))[0]!.id;
  });

  it("a new group gets a 60-day free trial automatically", async () => {
    const [g] = await db.user(tp).q<{ plan: string; paid_until: string }>(`select plan, paid_until::text from public.groups where id = $1`, [tg]);
    expect(g!.plan).toBe("trial");
    expect(g!.paid_until).toBe(new Date(Date.parse(`${today()}T00:00:00Z`) + 60 * 86400000).toISOString().slice(0, 10));
  });

  it("meetings open during the trial and during the 14-day grace period", async () => {
    expect((await db.user(tp).commit(`select public.open_meeting($1, '2026-01-04')`, [tg]))).toHaveLength(1);
    await setEnd(-14);
    expect((await db.user(tp).commit(`select public.open_meeting($1, '2026-01-11')`, [tg]))).toHaveLength(1);
  });

  it("after the grace period, new meetings pause, but existing meetings, offline sync and records still work", async () => {
    await setEnd(-15);
    await expect(db.user(tp).q(`select public.open_meeting($1, '2026-01-18')`, [tg])).rejects.toThrow(/subscription_ended/);
    // the meeting already opened can still be reopened and finished
    const [m] = await db.user(tp).commit<{ id: string }>(`select public.open_meeting($1, '2026-01-11') id`, [tg]);
    const [member] = await db.user(tp).q<{ id: string }>(`select id from public.members where group_id = $1 limit 1`, [tg]);
    const r = await db.user(tp).commit<{ r: { ok: boolean }[] }>(`select public.sync_ops($1::jsonb) r`, [JSON.stringify([
      { type: "payment", id: crypto.randomUUID(), meeting_id: m!.id, member_id: member!.id, amount: 2000, method: "cash", at: new Date().toISOString() },
      { type: "close", id: crypto.randomUUID(), meeting_id: m!.id },
    ])]);
    expect(r[0]!.r.every((x) => x.ok)).toBe(true);
    expect(await db.user(tp).q(`select * from public.member_balances where group_id = $1`, [tg])).not.toHaveLength(0);
  });

  it("paying unlocks it at once; pilot groups are never paused", async () => {
    await db.user(admin).commit(`select public.admin_record_subscription($1, 6, 10000, 'mtn_momo', 'MP-TEST')`, [tg]);
    expect((await db.user(tp).commit(`select public.open_meeting($1, '2026-01-25')`, [tg]))).toHaveLength(1);
    await db.user(admin).commit(`select public.admin_set_plan($1, 'pilot')`, [tg]);
    await setEnd(-400);
    expect((await db.user(tp).commit(`select public.open_meeting($1, '2026-02-01')`, [tg]))).toHaveLength(1);
  });

  it("paying during the trial adds the months after the trial ends", async () => {
    const u = await db.createUser(phone());
    const g2 = (await db.user(u).commit<{ id: string }>(`select public.create_group('Early Payers', null, 'en', 'monthly', 1::smallint, 5000, null, 'Pa') id`))[0]!.id;
    const [r] = await db.user(admin).commit<{ d: string }>(`select public.admin_record_subscription($1, 12, 20000, 'mtn_momo')::text d`, [g2]);
    const trialEnd = new Date(Date.parse(`${today()}T00:00:00Z`) + 60 * 86400000).toISOString().slice(0, 10);
    expect(r!.d).toBe(addMonths(trialEnd, 12));
  });

  it("officials can't extend their own trial", async () => {
    await expect(db.user(tp).q(`update public.groups set paid_until = '2099-01-01' where id = $1`, [tg])).rejects.toThrow(/platform admin/);
    await expect(db.user(tp).q(`update public.groups set plan = 'free' where id = $1`, [tg])).rejects.toThrow(/platform admin/);
  });
});
