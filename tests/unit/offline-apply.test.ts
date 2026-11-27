import { describe, expect, it } from "vitest";
import { applyOps, remainingToday } from "@/lib/offline/apply";
import type { QueuedOp, Snapshot } from "@/lib/offline/types";

const MID = "m1";
const snap: Snapshot = {
  fetched_at: "2026-01-05T10:00:00Z",
  meeting: { id: MID, group_id: "g", date: "2026-01-05", status: "open", minutes: null, cycle_id: "c" },
  group: { id: "g", name: "Unity", language: "pcm", contribution_per_hand: 5000, collectors_per_meeting: 1 },
  collectors: [{ slot_id: "s1", position: 1, hand_no: 1, member_id: "grace", name: "Grace", payouts: [] }],
  entry_ids: ["p0"],
  members: [
    { id: "mary", name: "Mary", hands: 2, status: "active", due_today: 10000, paid_today: 0, owing_before: 4000, attendance: null,
      payments: [], fines_paid_today: 0, loans_paid_today: 0,
      fines: [{ id: "f1", type: "late_payment", balance: 500 }], loans: [{ id: "l1", balance: 95000, due_date: "2027-02-15", overdue: false }] },
    { id: "grace", name: "Grace", hands: 1, status: "active", due_today: 5000, paid_today: 5000, owing_before: 0, attendance: "present",
      payments: [{ id: "p0", amount: 5000, method: "cash", momo_ref: null, at: "", reversed: false }], fines_paid_today: 0, loans_paid_today: 0, fines: [], loans: [] },
  ],
};
const at = "2026-01-05T10:05:00Z";

describe("applyOps", () => {
  it("adds pending payments and attendance to the totals", () => {
    const ops: QueuedOp[] = [
      { type: "payment", id: "p1", meeting_id: MID, member_id: "mary", amount: 6000, method: "cash", at },
      { type: "attendance", id: "a1", meeting_id: MID, member_id: "mary", status: "late", at },
    ];
    const v = applyOps(snap, ops);
    const mary = v.members.find((m) => m.id === "mary")!;
    expect(mary.paid_today).toBe(6000);
    expect(mary.attendance).toBe("late");
    expect(mary.pending).toBe(true);
    expect(v.totals).toEqual({ expected: 15000, collected: 11000, pot: 15000, fines: 0, loans: 0 });
    expect(remainingToday(mary)).toBe(4000);
  });

  it("never counts a payment twice once the snapshot already has it", () => {
    const withP1: Snapshot = {
      ...snap,
      members: snap.members.map((m) =>
        m.id === "mary" ? { ...m, paid_today: 6000, payments: [{ id: "p1", amount: 6000, method: "cash", momo_ref: null, at, reversed: false }] } : m,
      ),
    };
    const v = applyOps(withP1, [{ type: "payment", id: "p1", meeting_id: MID, member_id: "mary", amount: 6000, method: "cash", at, synced: true }]);
    expect(v.members.find((m) => m.id === "mary")!.paid_today).toBe(6000);
  });

  it("applies a correction to a synced or pending payment", () => {
    const v = applyOps(snap, [{ type: "reverse", id: "r1", meeting_id: MID, reverses: "p0", reason: "wrong person", at }]);
    const grace = v.members.find((m) => m.id === "grace")!;
    expect(grace.paid_today).toBe(0);
    expect(grace.payments[0]!.reversed).toBe(true);
  });

  it("ignores ops that the server rejected, and ops for another meeting", () => {
    const v = applyOps(snap, [
      { type: "payment", id: "x", meeting_id: MID, member_id: "mary", amount: 1000, method: "cash", at, error: "not allowed" },
      { type: "payment", id: "y", meeting_id: "other", member_id: "mary", amount: 1000, method: "cash", at },
    ]);
    expect(v.members.find((m) => m.id === "mary")!.paid_today).toBe(0);
  });

  it("records payouts and closing", () => {
    const v = applyOps(snap, [
      { type: "payout", id: "po", meeting_id: MID, slot_id: "s1", amount: 15000, method: "cash", at },
      { type: "close", id: "c", meeting_id: MID, minutes: "Done", at },
    ]);
    expect(v.collectors[0]!.payouts[0]!.amount).toBe(15000);
    expect(v.meeting.status).toBe("closed");
    expect(v.meeting.minutes).toBe("Done");
  });

  it("collects fines and loan repayments offline, and adds new fines", () => {
    const v = applyOps(snap, [
      { type: "fine_payment", id: "fp", meeting_id: MID, fine_id: "f1", amount: 500, method: "cash", at },
      { type: "loan_repayment", id: "lr", meeting_id: MID, loan_id: "l1", amount: 20000, method: "mtn_momo", at },
      { type: "fine", id: "f2", meeting_id: MID, group_id: "g", member_id: "grace", fine_type: "misconduct", amount: 1000, at },
    ]);
    const mary = v.members.find((m) => m.id === "mary")!;
    expect(mary.fines).toEqual([]); // fully paid fines disappear from the list
    expect(mary.loans[0]!.balance).toBe(75000);
    expect(v.members.find((m) => m.id === "grace")!.fines).toEqual([{ id: "f2", type: "misconduct", balance: 1000 }]);
    expect(v.totals.fines).toBe(500);
    expect(v.totals.loans).toBe(20000);
  });

  it("never applies a fine or loan payment twice once the server has it", () => {
    const synced: Snapshot = { ...snap, entry_ids: ["p0", "fp"], members: snap.members.map((m) => m.id === "mary"
      ? { ...m, fines: [], fines_paid_today: 500 } : m) };
    const v = applyOps(synced, [{ type: "fine_payment", id: "fp", meeting_id: MID, fine_id: "f1", amount: 500, method: "cash", at, synced: true }]);
    expect(v.totals.fines).toBe(500);
  });

  it("the pot is split when two hands collect at a meeting", () => {
    const two = { ...snap, group: { ...snap.group, collectors_per_meeting: 2 } };
    expect(applyOps(two, []).totals.pot).toBe(7500);
  });
});
