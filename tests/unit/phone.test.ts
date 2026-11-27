import { describe, expect, it } from "vitest";
import { formatCmPhone, normalizeCmPhone } from "@/lib/phone";
import { formatFcfa } from "@/lib/money";

describe("normalizeCmPhone", () => {
  it.each([
    ["670123456", "237670123456"],
    ["6 70 12 34 56", "237670123456"],
    ["+237 6 70 12 34 56", "237670123456"],
    ["00237670123456", "237670123456"],
    ["237-670-123-456", "237670123456"],
    ["222123456", "237222123456"],
  ])("%s -> %s", (input, out) => expect(normalizeCmPhone(input)).toBe(out));

  it.each(["", "12345", "770123456", "+234 803 123 4567", "2376701234567"])("rejects %s", (input) =>
    expect(normalizeCmPhone(input)).toBeNull(),
  );

  it("formats for display", () => expect(formatCmPhone("237670123456")).toBe("+237 6 70 12 34 56"));
});

describe("formatFcfa", () => {
  it("uses commas in English and Pidgin", () => {
    expect(formatFcfa(45000)).toBe("45,000 FCFA");
    expect(formatFcfa(1234567, "pcm")).toBe("1,234,567 FCFA");
    expect(formatFcfa(500)).toBe("500 FCFA");
  });
  it("uses narrow spaces in French", () => expect(formatFcfa(45000, "fr")).toBe("45 000 FCFA"));
});
