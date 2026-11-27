/**
 * Phone numbers are stored as digits with the country code and no "+", e.g. 237670123456 or 447911123456.
 *
 * Cameroon is the default: "670 12 34 56" -> 237670123456.
 * Anyone abroad types "+" (or "00") and their country code: "+44 7911 123456" -> 447911123456.
 * Cameroon numbers are checked strictly (9 digits starting with 6 or 2); others by length (8–15 digits).
 * Returns null when the number is not valid.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  const international = raw.startsWith("+") || raw.replace(/[\s.\-()]/g, "").startsWith("00");
  let d = raw.replace(/\D/g, "");
  if (international) {
    if (d.startsWith("00")) d = d.slice(2);
  } else if (d.length === 9) {
    d = "237" + d; // a local Cameroon number
  } else if (!(d.startsWith("237") && d.length === 12)) {
    return null; // a number from another country needs its "+country code"
  }
  if (!/^[1-9]\d{7,14}$/.test(d)) return null;
  if (d.startsWith("237") && !/^237[26]\d{8}$/.test(d)) return null;
  return d;
}

/** @deprecated kept for older imports: Cameroon-only check */
export function normalizeCmPhone(input: string): string | null {
  const p = normalizePhone(input);
  return p && p.startsWith("237") ? p : null;
}

/** "237670123456" -> "+237 6 70 12 34 56"; other countries -> "+447911123456" */
export function formatPhone(p: string): string {
  const m = /^237(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(p);
  if (m) return `+237 ${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}`;
  return /^\d+$/.test(p) ? `+${p}` : p;
}
export const formatCmPhone = formatPhone;

/** E.164 for Supabase Auth: "+237670123456" */
export function toE164(p: string): string {
  return p.startsWith("+") ? p : `+${p}`;
}
