// Mirrors public.loan_term_months / loan_interest_amount in the database, for the live preview on the loan form.

/** Whole months from start to due, counting a started month as a month (minimum 1). */
export function termMonths(start: string, due: string): number {
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${due}T00:00:00Z`);
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  let days = b.getUTCDate() - a.getUTCDate();
  if (days < 0) {
    // borrow a month, like Postgres age(): days in the start date's month
    months -= 1;
    days += new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 0)).getUTCDate();
  }
  return Math.max(1, months + (days > 0 ? 1 : 0));
}

/** "% per month": simple interest on the amount borrowed for each month. "flat": once. */
export function loanInterest(principal: number, ratePct: number, basis: "per_month" | "flat", months: number): number {
  return Math.round((principal * ratePct) / 100 * (basis === "per_month" ? months : 1));
}
