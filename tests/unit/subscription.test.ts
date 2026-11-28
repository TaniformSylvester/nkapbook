import { describe, expect, it } from "vitest";
import { canOpenMeetings, groupRef, stripeLinkFor, subscriptionConfig, subscriptionState } from "@/lib/subscription";

describe("subscriptionState", () => {
  const today = "2026-11-28";
  it("pilot and free groups never see payment notices or pauses", () => {
    expect(subscriptionState({ plan: "pilot", paid_until: null }, today)).toEqual({ kind: "pilot" });
    expect(subscriptionState({ plan: "free", paid_until: "2020-01-01" }, today)).toEqual({ kind: "free" });
  });
  it("trial and paid periods, with a 7-day warning", () => {
    expect(subscriptionState({ plan: "trial", paid_until: "2027-01-27" }, today)).toMatchObject({ kind: "trial", daysLeft: 60, ending: false });
    expect(subscriptionState({ plan: "paid", paid_until: "2026-12-05" }, today)).toMatchObject({ kind: "active", daysLeft: 7, ending: true });
  });
  it("14 days of grace after the end, then new meetings pause (matches the database)", () => {
    const grace = subscriptionState({ plan: "paid", paid_until: "2026-11-14" }, today);
    expect(grace).toEqual({ kind: "grace", until: "2026-11-14", lockOn: "2026-11-29" });
    expect(canOpenMeetings(grace)).toBe(true);
    const locked = subscriptionState({ plan: "trial", paid_until: "2026-11-13" }, today);
    expect(locked.kind).toBe("locked");
    expect(canOpenMeetings(locked)).toBe(false);
  });
});

describe("subscription settings", () => {
  it("2,000 a month; 6 months 10,000; 12 months 20,000; numbers only from the environment", () => {
    const c = subscriptionConfig({});
    expect(c.prices).toEqual({ 1: 2000, 3: 6000, 6: 10000, 12: 20000 });
    expect(c.mtn).toBeNull();
    expect(subscriptionConfig({ SUBSCRIPTION_MTN_NUMBER: "237 670 00 00 00" }).whatsapp).toBe("237670000000");
  });
  it("only accepts a real Stripe link, and attaches the group reference", () => {
    expect(subscriptionConfig({ SUBSCRIPTION_STRIPE_LINK: "https://evil.example/pay" }).stripeLink).toBeNull();
    const link = subscriptionConfig({ SUBSCRIPTION_STRIPE_LINK: "https://buy.stripe.com/test_123" }).stripeLink!;
    expect(stripeLinkFor(link, "9d51176a-dc89-49b2-a5a3-04d1f9353530")).toBe("https://buy.stripe.com/test_123?client_reference_id=NKAP-9D5117");
  });
  it("group reference is short and stable", () => expect(groupRef("9d51176a-dc89-49b2-a5a3-04d1f9353530")).toBe("NKAP-9D5117"));
});
