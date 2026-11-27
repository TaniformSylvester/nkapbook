import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Db, phone } from "./helpers";

let db: Db;
let alice: string; // president of group A
let bob: string; // president of group B
let carol: string; // treasurer of group A (invited)
let admin: string; // platform admin
let groupA: string;
let groupB: string;
let memberA: string;
let memberB: string;
let entryA: string;

const createGroup = `select public.create_group($1, 'Bamenda', 'pcm', 'monthly', 5::smallint, 5000, '2026-01-01', $2) as id`;

beforeAll(async () => {
  db = await Db.connect();
  alice = await db.createUser(phone());
  bob = await db.createUser(phone());
  const carolPhone = phone();
  carol = await db.createUser(carolPhone);
  admin = await db.createUser(phone());
  await db.admin(`insert into public.platform_admins (user_id) values ($1)`, [admin]);

  groupA = (await db.user(alice).commit<{ id: string }>(createGroup, ["Unity Njangi", "Alice"]))[0]!.id;
  groupB = (await db.user(bob).commit<{ id: string }>(createGroup, ["Other Njangi", "Bob"]))[0]!.id;

  memberA = (
    await db.user(alice).commit<{ id: string }>(
      `insert into public.members (group_id, name, phone, hands) values ($1, 'Mary', $2, 2) returning id`,
      [groupA, phone()],
    )
  )[0]!.id;
  memberB = (
    await db.user(bob).commit<{ id: string }>(
      `insert into public.members (group_id, name, phone) values ($1, 'Peter', $2) returning id`,
      [groupB, phone()],
    )
  )[0]!.id;

  entryA = randomUUID();
  await db.user(alice).commit(
    `insert into public.ledger_entries (id, group_id, member_id, kind, amount, method, recorded_by)
     values ($1, $2, $3, 'contribution_paid', 10000, 'cash', $4)`,
    [entryA, groupA, memberA, alice],
  );

  // Alice invites Carol as treasurer; Carol signs in and accepts.
  const carolMember = (
    await db.user(alice).commit<{ id: string }>(
      `insert into public.members (group_id, name, phone) values ($1, 'Carol', $2) returning id`,
      [groupA, carolPhone],
    )
  )[0]!.id;
  await db.user(alice).commit(
    `insert into public.official_invites (group_id, member_id, phone, role, invited_by) values ($1, $2, $3, 'treasurer', $4)`,
    [groupA, carolMember, carolPhone, alice],
  );
  await db.user(carol).commit(`select public.accept_invites()`);
});

afterAll(async () => {
  await db?.end();
});

describe("group isolation", () => {
  it("an official of group A cannot read group B", async () => {
    const rows = await db.user(alice).q(`select id from public.groups`);
    expect(rows.map((r) => r.id)).toEqual([groupA]);
  });

  it("an official of group A cannot read group B's members or phone numbers", async () => {
    const rows = await db.user(alice).q(`select id from public.members where group_id = $1`, [groupB]);
    expect(rows).toHaveLength(0);
  });

  it("an official of group A cannot read group B's ledger", async () => {
    await db.user(bob).commit(
      `insert into public.ledger_entries (id, group_id, member_id, kind, amount, method, recorded_by)
       values ($1, $2, $3, 'contribution_paid', 5000, 'cash', $4)`,
      [randomUUID(), groupB, memberB, bob],
    );
    const rows = await db.user(alice).q(`select id from public.ledger_entries where group_id = $1`, [groupB]);
    expect(rows).toHaveLength(0);
  });

  it("an official of group A cannot write into group B", async () => {
    await expect(
      db.user(alice).q(
        `insert into public.ledger_entries (id, group_id, member_id, kind, amount, recorded_by)
         values ($1, $2, $3, 'contribution_paid', 5000, $4)`,
        [randomUUID(), groupB, memberB, alice],
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.user(alice).q(`insert into public.members (group_id, name) values ($1, 'Spy')`, [groupB]),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot attach a member of group B to a record in group A", async () => {
    await expect(
      db.user(alice).q(
        `insert into public.ledger_entries (id, group_id, member_id, kind, amount, recorded_by)
         values ($1, $2, $3, 'contribution_paid', 5000, $4)`,
        [randomUUID(), groupA, memberB, alice],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("a signed-in user with no group sees nothing", async () => {
    const stranger = await db.createUser(phone());
    expect(await db.user(stranger).q(`select id from public.groups`)).toHaveLength(0);
    expect(await db.user(stranger).q(`select id from public.members`)).toHaveLength(0);
    expect(await db.user(stranger).q(`select id from public.ledger_entries`)).toHaveLength(0);
  });

  it("the anonymous browser role cannot read any table", async () => {
    for (const t of ["groups", "members", "member_links", "ledger_entries", "audit_log"]) {
      await expect(db.as({ role: "anon" }, `select * from public.${t}`)).rejects.toThrow(/permission denied/);
    }
  });

  it("the platform admin can read all groups", async () => {
    const rows = await db.user(admin).q(`select id from public.groups where id in ($1, $2)`, [groupA, groupB]);
    expect(rows).toHaveLength(2);
  });
});

describe("audit trail", () => {
  it("ledger entries cannot be edited or deleted, even by the president", async () => {
    await expect(
      db.user(alice).q(`update public.ledger_entries set amount = 1 where id = $1`, [entryA]),
    ).rejects.toThrow(/permission denied|cannot be edited/);
    await expect(db.user(alice).q(`delete from public.ledger_entries where id = $1`, [entryA])).rejects.toThrow(
      /permission denied|cannot be edited/,
    );
    // even the database owner is blocked by the trigger
    await expect(db.admin(`update public.ledger_entries set amount = 1 where id = $1`, [entryA])).rejects.toThrow(
      /cannot be edited/,
    );
  });

  it("nobody but the owner can truncate or delete ledger rows", async () => {
    for (const t of ["ledger_entries", "audit_log", "members", "groups"]) {
      await expect(db.user(alice).q(`truncate public.${t} cascade`)).rejects.toThrow(/permission denied/);
      await expect(db.as({ role: "anon" }, `truncate public.${t} cascade`)).rejects.toThrow(/permission denied/);
    }
  });

  it("anonymous callers cannot run the official functions", async () => {
    for (const sql of [
      `select public.create_group('X', null, 'en', 'monthly', 1::smallint, 100, null, 'X')`,
      `select public.reset_member_link('${randomUUID()}')`,
      `select public.check_rate_limit('a', 'b', 1, 60)`,
    ]) {
      await expect(db.as({ role: "anon" }, sql)).rejects.toThrow(/permission denied/);
    }
  });

  it("a correction must mirror the original and give a reason", async () => {
    const base = `insert into public.ledger_entries (id, group_id, member_id, kind, amount, method, recorded_by, reverses_entry_id, reason)
                  values ($1, $2, $3, 'contribution_paid', $4, 'cash', $5, $6, $7)`;
    await expect(
      db.user(alice).q(base, [randomUUID(), groupA, memberA, 9999, alice, entryA, "typo"]),
    ).rejects.toThrow(/must match/);
    await expect(db.user(alice).q(base, [randomUUID(), groupA, memberA, 10000, alice, entryA, null])).rejects.toThrow(
      /reversal_needs_reason/,
    );
    const ok = await db.user(alice).q(base + " returning id", [randomUUID(), groupA, memberA, 10000, alice, entryA, "Recorded twice"]);
    expect(ok).toHaveLength(1);
  });

  it("an entry can only be reversed once", async () => {
    const base = `insert into public.ledger_entries (id, group_id, member_id, kind, amount, method, recorded_by, reverses_entry_id, reason)
                  values ($1, $2, $3, 'contribution_paid', 10000, 'cash', $4, $5, 'dup')`;
    await db.user(alice).commit(base, [randomUUID(), groupA, memberA, alice, entryA]);
    await expect(db.user(alice).q(base, [randomUUID(), groupA, memberA, alice, entryA])).rejects.toThrow(/unique/);
  });

  it("officials cannot record entries in someone else's name", async () => {
    await expect(
      db.user(alice).q(
        `insert into public.ledger_entries (id, group_id, member_id, kind, amount, recorded_by)
         values ($1, $2, $3, 'contribution_paid', 5000, $4)`,
        [randomUUID(), groupA, memberA, carol],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("member changes are written to the audit log", async () => {
    await db.user(alice).commit(`update public.members set hands = 3 where id = $1`, [memberA]);
    const rows = await db.user(alice).q<{ action: string; actor: string }>(
      `select action, actor from public.audit_log where table_name = 'members' and row_id = $1 order by id`,
      [memberA],
    );
    expect(rows.map((r) => r.action)).toEqual(["insert", "update"]);
    expect(rows[1]!.actor).toBe(alice);
  });
});

describe("roles and invites", () => {
  it("an invited official can read their group after accepting", async () => {
    const rows = await db.user(carol).q(`select role from public.members where user_id = $1`, [carol]);
    expect(rows).toEqual([{ role: "treasurer" }]);
    expect(await db.user(carol).q(`select id from public.groups`)).toHaveLength(1);
  });

  it("only the president can change roles", async () => {
    await expect(
      db.user(carol).q(`update public.members set role = 'secretary' where id = $1`, [memberA]),
    ).rejects.toThrow(/only the president/);
    const ok = await db.user(alice).q(`update public.members set role = 'secretary' where id = $1 returning role`, [memberA]);
    expect(ok).toEqual([{ role: "secretary" }]);
  });

  it("only the president can invite officials", async () => {
    await expect(
      db.user(carol).q(
        `insert into public.official_invites (group_id, member_id, phone, role, invited_by) values ($1, $2, $3, 'secretary', $4)`,
        [groupA, memberA, phone(), carol],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("officials cannot link a login to a member directly", async () => {
    await expect(
      db.user(alice).q(`update public.members set user_id = $2 where id = $1`, [memberA, bob]),
    ).rejects.toThrow(/invites/);
  });

  it("only the platform admin can change a group's plan", async () => {
    await expect(db.user(alice).q(`update public.groups set plan = 'paid' where id = $1`, [groupA])).rejects.toThrow(
      /platform admin/,
    );
    await expect(db.user(alice).q(`select public.admin_set_plan($1, 'paid')`, [groupA])).rejects.toThrow(/not allowed/);
    await db.user(admin).q(`select public.admin_set_plan($1, 'paid')`, [groupA]);
  });

  it("member links: only officials of the group can create or read them", async () => {
    const tok = (await db.user(alice).commit<{ t: string }>(`select public.reset_member_link($1) as t`, [memberA]))[0]!.t;
    expect(tok.length).toBeGreaterThanOrEqual(43);
    await expect(db.user(bob).q(`select public.reset_member_link($1)`, [memberA])).rejects.toThrow(/not allowed/);
    expect(await db.user(bob).q(`select token from public.member_links where member_id = $1`, [memberA])).toHaveLength(0);
    // resetting revokes the old one
    const tok2 = (await db.user(alice).commit<{ t: string }>(`select public.reset_member_link($1) as t`, [memberA]))[0]!.t;
    const live = await db.user(alice).q<{ token: string }>(
      `select token from public.member_links where member_id = $1 and revoked_at is null`,
      [memberA],
    );
    expect(live).toEqual([{ token: tok2 }]);
    // and no token ends up in the audit log
    const audit = await db.admin<{ n: number }>(
      `select count(*)::int n from public.audit_log where table_name = 'member_links' and (new_row ? 'token' or old_row ? 'token')`,
    );
    expect(audit[0]!.n).toBe(0);
  });
});
