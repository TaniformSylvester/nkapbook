import { describe, expect, it } from "vitest";
import { groupRef, subscriptionConfig, subscriptionState } from "@/lib/subscription";

describe("subscriptionState", () => {
  const today = "2026-11-27";
  it("pilot and free groups never see payment reminders", () => {
    expect(subscriptionState({ plan: "pilot", paid_until: null }, today)).toEqual({ kind: "pilot" });
    expect(subscriptionState({ plan: "free", paid_until: "2020-01-01" }, today)).toEqual({ kind: "free" });
  });
  it("active, ending within a week, and ended", () => {
    expect(subscriptionState({ plan: "paid", paid_until: "2027-01-27" }, today)).toMatchObject({ kind: "active", daysLeft: 61 });
    expect(subscriptionState({ plan: "paid", paid_until: "2026-12-04" }, today)).toMatchObject({ kind: "ending", daysLeft: 7 });
    expect(subscriptionState({ plan: "paid", paid_until: "2026-11-27" }, today)).toMatchObject({ kind: "ending", daysLeft: 0 });
    expect(subscriptionState({ plan: "paid", paid_until: "2026-11-26" }, today)).toEqual({ kind: "expired", until: "2026-11-26" });
  });
});

describe("subscription settings", () => {
  it("default price is 2,000 FCFA; numbers come only from the environment", () => {
    expect(subscriptionConfig({})).toEqual({ price: 2000, mtn: null, orange: null, payee: null, whatsapp: null });
    expect(subscriptionConfig({ SUBSCRIPTION_MTN_NUMBER: "237 670 00 00 00" }).whatsapp).toBe("237670000000");
  });
  it("group reference is short and stable", () => expect(groupRef("9d51176a-dc89-49b2-a5a3-04d1f9353530")).toBe("NKAP-9D5117"));
});
