import { describe, expect, it } from "vitest";
import { CURRENCIES, currencyLabel, formatFcfa, formatMoney } from "@/lib/money";
import { composeReminder } from "@/lib/reminders/compose";
import { readGroupForm } from "@/lib/forms";

describe("formatMoney", () => {
  it("FCFA stays the default and looks the same as before", () => {
    expect(formatMoney(45000)).toBe("45,000 FCFA");
    expect(formatMoney(45000, "fr")).toBe("45\u202f000 FCFA");
    expect(formatFcfa(2000, "pcm")).toBe("2,000 FCFA");
  });
  it("other currencies: symbol before in English, after in French", () => {
    expect(formatMoney(10000, "en", "THB")).toBe("฿10,000");
    expect(formatMoney(10000, "fr", "THB")).toBe("10\u202f000 ฿");
    expect(formatMoney(250, "en", "GBP")).toBe("£250");
    expect(formatMoney(250, "fr", "EUR")).toBe("250 €");
    expect(formatMoney(-1500, "en", "NGN")).toBe("-₦1,500");
    expect(formatMoney(100, "en", "USD")).toBe("US$100");
  });
  it("an unknown code falls back to FCFA rather than breaking", () => {
    expect(formatMoney(5, "en", "BTC")).toBe("5 FCFA");
  });
  it("every currency has a label", () => {
    for (const c of CURRENCIES) expect(currencyLabel(c)).toMatch(/^(FCFA|[A-Z]{3})$/);
  });
});

describe("group currency in forms and reminders", () => {
  const form = (extra: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ name: "Bangkok Njangi", language: "en", frequency: "monthly", meeting_day: "6", contribution: "10,000", start_date: "2026-12-06", ...extra })) f.set(k, v);
    return f;
  };
  it("reads a valid currency, rejects an unknown one, and leaves it out when locked", () => {
    expect(readGroupForm(form({ currency: "THB" }))).toMatchObject({ currency: "THB", contribution_per_hand: 10000 });
    expect(readGroupForm(form({ currency: "BTC" }))).toBeNull();
    expect(readGroupForm(form({}))).not.toHaveProperty("currency");
  });
  it("reminders use the group's currency", () => {
    const text = composeReminder("en", { name: "Anne", group: "Bangkok Njangi", amount: 10000, day: "Sunday", paid: 0, owing: 0, currency: "THB" });
    expect(text).toContain("฿10,000");
    expect(text).not.toContain("FCFA");
  });
});
