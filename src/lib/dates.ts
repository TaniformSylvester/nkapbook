import type { Lang } from "@/i18n";

/** "14 March 2027" (en/pcm) or "14 mars 2027" (fr). Dates are YYYY-MM-DD or ISO timestamps. */
export function fmtDate(lang: Lang, d: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" }) {
  const date = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return date.toLocaleDateString(lang === "fr" ? "fr-CM" : "en-GB", { timeZone: "Africa/Douala", ...opts });
}
