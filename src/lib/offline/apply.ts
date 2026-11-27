import type { QueuedOp, SnapMember, Snapshot } from "./types";

export type ViewMember = SnapMember & { pending: boolean };
export type View = Omit<Snapshot, "members"> & {
  members: ViewMember[];
  totals: { expected: number; collected: number; pot: number; fines: number; loans: number };
};

/**
 * The screen shows the last server snapshot plus the ops still waiting on this phone.
 * Ops already included in the snapshot (same id) are skipped, so nothing is counted twice.
 * Ops that failed on the server are not applied.
 */
export function applyOps(snap: Snapshot, ops: QueuedOp[]): View {
  const members = snap.members.map((m) => ({
    ...m,
    fines_paid_today: m.fines_paid_today ?? 0,
    loans_paid_today: m.loans_paid_today ?? 0,
    payments: m.payments.map((p) => ({ ...p })),
    fines: (m.fines ?? []).map((f) => ({ ...f })),
    loans: (m.loans ?? []).map((l) => ({ ...l })),
    pending: false,
  }));
  const collectors = snap.collectors.map((c) => ({ ...c, payouts: c.payouts.map((p) => ({ ...p })) }));
  const meeting = { ...snap.meeting };
  const byId = new Map(members.map((m) => [m.id, m]));
  const known = new Set<string>(snap.entry_ids ?? []);
  for (const m of members) for (const f of m.fines) known.add(f.id);
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
      case "fine": {
        const m = byId.get(op.member_id);
        if (!m || known.has(op.id)) break;
        m.fines.push({ id: op.id, type: op.fine_type, balance: op.amount });
        m.pending = true;
        known.add(op.id);
        break;
      }
      case "fine_payment": {
        if (known.has(op.id)) break;
        for (const m of members) {
          const f = m.fines.find((x) => x.id === op.fine_id);
          if (!f) continue;
          f.balance = Math.max(0, f.balance - op.amount);
          m.fines_paid_today += op.amount;
          m.pending = true;
        }
        known.add(op.id);
        break;
      }
      case "loan_repayment": {
        if (known.has(op.id)) break;
        for (const m of members) {
          const l = m.loans.find((x) => x.id === op.loan_id);
          if (!l) continue;
          l.balance = Math.max(0, l.balance - op.amount);
          m.loans_paid_today += op.amount;
          m.pending = true;
        }
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
  for (const m of members) m.fines = m.fines.filter((f) => f.balance > 0);
  const fines = members.reduce((s, m) => s + m.fines_paid_today, 0);
  const loans = members.reduce((s, m) => s + m.loans_paid_today, 0);
  return { ...snap, meeting, members, collectors, totals: { expected, collected, pot: Math.round(expected / k), fines, loans } };
}

/** What one tap on "Pay" records: whatever is left of today's amount. */
export function remainingToday(m: Pick<SnapMember, "due_today" | "paid_today">): number {
  return Math.max(0, m.due_today - m.paid_today);
}
