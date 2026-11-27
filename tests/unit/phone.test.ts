import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { formatFcfa } from "@/lib/money";

describe("normalizePhone", () => {
  it.each([
    ["670123456", "237670123456"],
    ["6 70 12 34 56", "237670123456"],
    ["+237 6 70 12 34 56", "237670123456"],
    ["00237670123456", "237670123456"],
    ["237-670-123-456", "237670123456"],
    ["222123456", "237222123456"],
  ])("%s -> %s", (input, out) => expect(normalizePhone(input)).toBe(out));

  it.each([
    ["+44 7911 123456", "447911123456"], // UK
    ["+1 (617) 555-0123", "16175550123"], // USA
    ["0033 6 12 34 56 78", "33612345678"], // France
    ["+234 803 123 4567", "2348031234567"], // Nigeria
    ["+237 6 70 12 34 56", "237670123456"], // Cameroon written with +
  ])("abroad: %s -> %s", (input, out) => expect(normalizePhone(input)).toBe(out));

  it.each([
    "", "12345", "770123456", "2376701234567", "+237 7 70 12 34 56", // bad Cameroon numbers are still caught
    "07911 123456", // a foreign number without "+country code"
    "+0 123 456 789", "+1234567", "+1234567890123456",
  ])("rejects %s", (input) => expect(normalizePhone(input)).toBeNull());

  it("formats for display", () => {
    expect(formatPhone("237670123456")).toBe("+237 6 70 12 34 56");
    expect(formatPhone("447911123456")).toBe("+447911123456");
  });
});

describe("formatFcfa", () => {
  it("uses commas in English and Pidgin", () => {
    expect(formatFcfa(45000)).toBe("45,000 FCFA");
    expect(formatFcfa(1234567, "pcm")).toBe("1,234,567 FCFA");
    expect(formatFcfa(500)).toBe("500 FCFA");
  });
  it("uses narrow spaces in French", () => expect(formatFcfa(45000, "fr")).toBe("45 000 FCFA"));
});
