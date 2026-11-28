import type { Group } from "./types";

export const TRIAL_DAYS = 60;
export const GRACE_DAYS = 14;

/** Subscription settings come from the environment, so payment numbers never live in the code. */
export function subscriptionConfig(env: Record<string, string | undefined> = process.env) {
  const price = Number(env.SUBSCRIPTION_PRICE_XAF ?? 2000) || 2000;
  const stripe = env.SUBSCRIPTION_STRIPE_LINK?.trim();
  return {
    price,
    prices: {
      1: price,
      3: price * 3,
      6: Number(env.SUBSCRIPTION_PRICE_6M ?? 0) || price * 5, // 6 months: 1 month free
      12: Number(env.SUBSCRIPTION_PRICE_12M ?? 0) || price * 10, // 12 months: 2 months free
    } as Record<1 | 3 | 6 | 12, number>,
    mtn: env.SUBSCRIPTION_MTN_NUMBER?.trim() || null,
    orange: env.SUBSCRIPTION_ORANGE_NUMBER?.trim() || null,
    payee: env.SUBSCRIPTION_PAYEE_NAME?.trim() || null,
    whatsapp: (env.SUBSCRIPTION_WHATSAPP_NUMBER ?? env.SUBSCRIPTION_MTN_NUMBER)?.replace(/\D/g, "") || null,
    stripeLink: stripe && /^https:\/\/(buy|checkout)\.stripe\.com\//.test(stripe) ? stripe : null,
  };
}

/** Short reference a treasurer writes in the MoMo message so payments can be matched to the group. */
export function groupRef(groupId: string) {
  return `NKAP-${groupId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

/** Stripe Payment Link with the group's reference attached, so card payments can be matched too. */
export function stripeLinkFor(link: string, groupId: string) {
  return `${link}${link.includes("?") ? "&" : "?"}client_reference_id=${groupRef(groupId)}`;
}

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export type SubState =
  | { kind: "pilot" }
  | { kind: "free" }
  | { kind: "trial" | "active"; until: string; daysLeft: number; ending: boolean } // ending: 7 days or fewer left
  | { kind: "grace"; until: string; lockOn: string } // ended, meetings still open until lockOn
  | { kind: "locked"; until: string | null }; // new meetings paused

export function subscriptionState(g: Pick<Group, "plan"> & { paid_until: string | null }, today: string): SubState {
  if (g.plan === "pilot") return { kind: "pilot" };
  if (g.plan === "free") return { kind: "free" };
  if (!g.paid_until) return { kind: "locked", until: null };
  const days = Math.round((Date.parse(`${g.paid_until}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (days >= 0) return { kind: g.plan === "trial" ? "trial" : "active", until: g.paid_until, daysLeft: days, ending: days <= 7 };
  if (-days <= GRACE_DAYS) return { kind: "grace", until: g.paid_until, lockOn: addDays(g.paid_until, GRACE_DAYS + 1) };
  return { kind: "locked", until: g.paid_until };
}

export const canOpenMeetings = (s: SubState) => s.kind !== "locked";
