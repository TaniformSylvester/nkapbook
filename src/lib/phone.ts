/**
 * Normalise a Cameroon phone number to 2376XXXXXXXX (or 2372XXXXXXXX for fixed lines).
 * Accepts "670 12 34 56", "+237 6 70 12 34 56", "00237670123456", "237670123456".
 * Returns null when it is not a valid Cameroon number.
 */
export function normalizeCmPhone(input: string): string | null {
  let d = input.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  d = d.replace(/\D/g, "");
  if (d.length === 9) d = "237" + d;
  return /^237[26]\d{8}$/.test(d) ? d : null;
}

/** "237670123456" -> "+237 6 70 12 34 56" */
export function formatCmPhone(p: string): string {
  const m = /^237(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(p);
  return m ? `+237 ${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}` : p;
}

/** E.164 for Supabase Auth: "+237670123456" */
export function toE164(p: string): string {
  return p.startsWith("+") ? p : `+${p}`;
}
