import { describe, expect, it } from "vitest";
import { loanInterest, termMonths } from "@/lib/loans";

describe("loan maths (must match the database)", () => {
  it.each([
    ["2026-01-10", "2026-04-10", 3],
    ["2026-01-10", "2026-04-11", 4],
    ["2026-01-10", "2026-01-20", 1],
    ["2026-01-31", "2026-02-28", 1],
    ["2026-01-10", "2027-01-10", 12],
    ["2026-01-10", "2026-01-10", 1],
  ])("%s → %s = %i months", (a, b, n) => expect(termMonths(a, b)).toBe(n));

  it("5% per month for 3 months on 100,000 = 15,000", () => expect(loanInterest(100000, 5, "per_month", 3)).toBe(15000));
  it("10% flat on 50,000 = 5,000", () => expect(loanInterest(50000, 10, "flat", 6)).toBe(5000));
  it("rounds to whole FCFA", () => expect(loanInterest(33333, 2.5, "per_month", 1)).toBe(833));
});
