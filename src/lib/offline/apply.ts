import type { QueuedOp, SnapMember, Snapshot } from "./types";

export type ViewMember = SnapMember & { pending: boolean };
export type View = Omit<Snapshot, "members"> & {
  members: ViewMember[];
  totals: { expected: number; collected: number; pot: number };
};

/**
 * The screen shows the last server snapshot plus the ops still waiting on this phone.
 * Ops already included in the snapshot (same id) are skipped, so nothing is counted twice.
 * Ops that failed on the server are not applied.
 */
export function applyOps(snap: Snapshot, ops: QueuedOp[]): View {
  const members = snap.members.map((m) => ({ ...m, payments: m.payments.map((p) => ({ ...p })), pending: false }));
  const collectors = snap.collectors.map((c) => ({ ...c, payouts: c.payouts.map((p) => ({ ...p })) }));
  const meeting = { ...snap.meeting };
  const byId = new Map(members.map((m) => [m.id, m]));
  const known = new Set<string>();
  for (const m of members) for (const p of m.payments) known.add(p.id);
  for (const c of collectors) for (const p of c.payouts) known.add(p.id);

  for (const op of ops) {
    if (op.error || op.meeting_id !== snap.meeting.id) continue;
    switch (op.type) {
      case "payment": {
        const m = byId.get(op.member_id);
        if (!m || known.has(op.id)) break;
        m.payments.push({ id: op.id, amount: op.amount, method: op.method, momo_ref: op.momo_ref ?? null, at: op.at, reversed: false });
        m.paid_today += op.amount;
        m.pending = true;
        known.add(op.id);
        break;
      }
      case "reverse": {
        for (const m of members) {
          const p = m.payments.find((x) => x.id === op.reverses);
          if (p && !p.reversed) {
            p.reversed = true;
            m.paid_today -= p.amount;
            m.pending = true;
          }
        }
        for (const c of collectors) {
          const p = c.payouts.find((x) => x.id === op.reverses);
          if (p) p.reversed = true;
        }
        break;
      }
      case "attendance": {
        const m = byId.get(op.member_id);
        if (m) {
          m.attendance = op.status;
          m.pending = true;
        }
        break;
      }
      case "payout": {
        const c = collectors.find((x) => x.slot_id === op.slot_id);
        if (!c || known.has(op.id)) break;
        c.payouts.push({ id: op.id, amount: op.amount, method: op.method, reversed: false, confirmed: false });
        known.add(op.id);
        break;
      }
      case "minutes":
        meeting.minutes = op.minutes;
        break;
      case "close":
        meeting.status = "closed";
        if (op.minutes !== undefined) meeting.minutes = op.minutes;
        break;
    }
  }

  const expected = members.reduce((s, m) => s + m.due_today, 0);
  const collected = members.reduce((s, m) => s + m.paid_today, 0);
  const k = Math.max(1, snap.group.collectors_per_meeting, collectors.length || 1);
  return { ...snap, meeting, members, collectors, totals: { expected, collected, pot: Math.round(expected / k) } };
}

/** What one tap on "Pay" records: whatever is left of today's amount. */
export function remainingToday(m: Pick<SnapMember, "due_today" | "paid_today">): number {
  return Math.max(0, m.due_today - m.paid_today);
}
