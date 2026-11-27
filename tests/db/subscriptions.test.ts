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
