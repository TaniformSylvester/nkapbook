export type Method = "cash" | "mtn_momo" | "orange_money" | "bank" | "other";
export type Attendance = "present" | "absent" | "late" | "excused";
export const METHODS: Method[] = ["cash", "mtn_momo", "orange_money", "bank", "other"];
export const ATTENDANCE: Attendance[] = ["present", "late", "absent", "excused"];

export type SnapPayment = { id: string; amount: number; method: Method; momo_ref: string | null; at: string; reversed: boolean };
export type SnapMember = {
  id: string;
  name: string;
  hands: number;
  status: "active" | "left";
  due_today: number;
  paid_today: number;
  owing_before: number;
  attendance: Attendance | null;
  payments: SnapPayment[];
};
export type SnapPayout = { id: string; amount: number; method: Method; reversed: boolean; confirmed: boolean };
export type SnapCollector = { slot_id: string; position: number; hand_no: number; member_id: string; name: string; payouts: SnapPayout[] };

/** What the server's meeting_snapshot() returns. */
export type Snapshot = {
  fetched_at: string;
  meeting: { id: string; group_id: string; date: string; status: "planned" | "open" | "closed"; minutes: string | null; cycle_id: string | null };
  group: { id: string; name: string; language: "en" | "fr" | "pcm"; contribution_per_hand: number; collectors_per_meeting: number };
  collectors: SnapCollector[];
  members: SnapMember[];
};

type Base = { id: string; at: string; meeting_id: string };
export type Op =
  | (Base & { type: "payment"; member_id: string; amount: number; method: Method; momo_ref?: string })
  | (Base & { type: "payout"; slot_id: string; amount: number; method: Method; momo_ref?: string })
  | (Base & { type: "reverse"; reverses: string; reason: string })
  | (Base & { type: "attendance"; member_id: string; status: Attendance })
  | (Base & { type: "minutes"; minutes: string })
  | (Base & { type: "close"; minutes?: string });

/** An op in the phone's outbox. */
export type QueuedOp = Op & { error?: string; synced?: boolean };
