/** Whole FCFA amounts. 45000 -> "45,000 FCFA" (en/pcm) or "45 000 FCFA" (fr). */
export function formatFcfa(amount: number, lang: "en" | "fr" | "pcm" = "en"): string {
  const sign = amount < 0 ? "-" : "";
  const digits = Math.abs(Math.round(amount)).toString();
  const sep = lang === "fr" ? " " : ",";
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep)} FCFA`;
}
