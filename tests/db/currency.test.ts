import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Db, phone } from "./helpers";

let db: Db;
let pres: string;
let gid: string;
let member: string;

beforeAll(async () => {
  db = await Db.connect();
  pres = await db.createUser(phone());
  gid = (await db.user(pres).commit<{ id: string }>(
    `select public.create_group('Bangkok Njangi', 'Bangkok', 'en', 'monthly', 6::smallint, 10000, null, 'Juicy', 'THB') as id`))[0]!.id;
  member = (await db.user(pres).commit<{ id: string }>(
    `insert into public.members (group_id, name) values ($1, 'Anne') returning id`, [gid]))[0]!.id;
});
afterAll(async () => db?.end());

describe("group currency", () => {
  it("a group can be created in its own currency; FCFA stays the default", async () => {
    expect((await db.user(pres).q<{ currency: string }>(`select currency from public.groups where id = $1`, [gid]))[0]!.currency).toBe("THB");
    const other = (await db.user(pres).commit<{ id: string }>(
      `select public.create_group('Buea Njangi', 'Buea', 'en', 'weekly', 0::smallint, 5000, null, 'Juicy') as id`))[0]!.id;
    expect((await db.user(pres).q<{ currency: string }>(`select currency from public.groups where id = $1`, [other]))[0]!.currency).toBe("XAF");
  });

  it("only known currencies are accepted", async () => {
    await expect(db.user(pres).q(
      `select public.create_group('X', null, 'en', 'weekly', 0::smallint, 5000, null, 'Juicy', 'BTC')`)).rejects.toThrow(/currency_check/);
  });

  it("officials can change the currency while nothing has been recorded", async () => {
    await db.user(pres).commit(`update public.groups set currency = 'EUR' where id = $1`, [gid]);
    await db.user(pres).commit(`update public.groups set currency = 'THB' where id = $1`, [gid]);
  });

  it("once money is recorded the currency is locked (other settings can still change)", async () => {
    await db.user(pres).commit(`select public.open_meeting($1, '2026-12-06')`, [gid]);
    await expect(db.user(pres).q(`update public.groups set currency = 'XAF' where id = $1`, [gid])).rejects.toThrow(/currency_locked/);
    await db.user(pres).commit(`update public.groups set town = 'Pattaya' where id = $1`, [gid]);
  });

  it("the member's private link includes the currency", async () => {
    const token = (await db.user(pres).commit<{ t: string }>(`select public.reset_member_link($1) t`, [member]))[0]!.t;
    const v = (await db.as<{ v: { group: { currency: string } } }>({ role: "service_role" }, `select public.member_view($1, '10.0.0.9') v`, [token], true))[0]!.v;
    expect(v.group.currency).toBe("THB");
  });
});
