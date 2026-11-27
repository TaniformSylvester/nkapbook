import { describe, expect, it } from "vitest";
import { termMonths } from "@/lib/loans";

// Values produced by public.loan_term_months() in Postgres, so the form's preview matches what gets saved.
const FROM_DB: [string, string, number][] = [
  ["2026-01-31", "2026-03-01", 2],
  ["2026-01-31", "2026-02-28", 1],
  ["2026-03-31", "2026-04-30", 1],
  ["2026-01-15", "2026-03-14", 2],
  ["2026-12-20", "2027-02-05", 2],
  ["2026-02-28", "2026-03-31", 2],
  ["2026-05-31", "2026-06-01", 1],
  ["2026-01-10", "2026-04-11", 4],
  ["2026-07-01", "2027-06-30", 12],
];

describe("termMonths matches the database", () => {
  it.each(FROM_DB)("%s → %s", (a, b, n) => expect(termMonths(a, b)).toBe(n));
});
