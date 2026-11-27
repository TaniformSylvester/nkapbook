import type { Group } from "./types";

/** Subscription settings come from the environment, so payment numbers never live in the code. */
export function subscriptionConfig(env: Record<string, string | undefined> = process.env) {
  const price = Number(env.SUBSCRIPTION_PRICE_XAF ?? 2000) || 2000;
  return {
    price,
    mtn: env.SUBSCRIPTION_MTN_NUMBER?.trim() || null,
    orange: env.SUBSCRIPTION_ORANGE_NUMBER?.trim() || null,
    payee: env.SUBSCRIPTION_PAYEE_NAME?.trim() || null,
    whatsapp: (env.SUBSCRIPTION_WHATSAPP_NUMBER ?? env.SUBSCRIPTION_MTN_NUMBER)?.replace(/\D/g, "") || null,
  };
}

/** Short reference a treasurer writes in the MoMo message so payments can be matched to the group. */
export function groupRef(groupId: string) {
  return `NKAP-${groupId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export type SubState =
  | { kind: "pilot" }
  | { kind: "free" }
  | { kind: "active"; until: string; daysLeft: number }
  | { kind: "ending"; until: string; daysLeft: number } // 7 days or fewer left
  | { kind: "expired"; until: string | null };

export function subscriptionState(g: Pick<Group, "plan"> & { paid_until: string | null }, today: string): SubState {
  if (g.plan === "pilot") return { kind: "pilot" };
  if (g.plan === "free") return { kind: "free" };
  if (!g.paid_until) return { kind: "expired", until: null };
  const days = Math.round((Date.parse(`${g.paid_until}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (days < 0) return { kind: "expired", until: g.paid_until };
  return { kind: days <= 7 ? "ending" : "active", until: g.paid_until, daysLeft: days };
}
