// Money is stored as whole numbers in the group's currency (no cents). NkapBook's own subscription is in FCFA.

export const CURRENCIES = ["XAF", "XOF", "NGN", "GHS", "KES", "ZAR", "THB", "EUR", "GBP", "USD", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const isCurrency = (c: unknown): c is Currency => CURRENCIES.includes(c as Currency);

type Lang = "en" | "fr" | "pcm";
// How amounts are written. French puts symbols after the number ("45 000 €").
const STYLE: Record<Currency, { pre?: string; post?: string; frPost?: string }> = {
  XAF: { post: " FCFA" },
  XOF: { post: " FCFA" },
  NGN: { pre: "₦", frPost: " ₦" },
  GHS: { pre: "GH₵", frPost: " GH₵" },
  KES: { pre: "KSh ", frPost: " KSh" },
  ZAR: { pre: "R ", frPost: " R" },
  THB: { pre: "฿", frPost: " ฿" },
  EUR: { pre: "€", frPost: " €" },
  GBP: { pre: "£", frPost: " £" },
  USD: { pre: "US$", frPost: " $ US" },
  CAD: { pre: "CA$", frPost: " $ CA" },
};

/** Short label for form fields: "FCFA" for the CFA francs, otherwise the ISO code ("THB"). */
export const currencyLabel = (c: string) => (c === "XAF" || c === "XOF" ? "FCFA" : c);

/** 45000 -> "45,000 FCFA" / "฿45,000" (en, pcm) or "45 000 FCFA" / "45 000 ฿" (fr). */
export function formatMoney(amount: number, lang: Lang = "en", currency: string = "XAF"): string {
  const s = STYLE[isCurrency(currency) ? currency : "XAF"];
  const sign = amount < 0 ? "-" : "";
  const digits = Math.abs(Math.round(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, lang === "fr" ? "\u202f" : ",");
  if (s.post) return `${sign}${digits}${s.post}`;
  return lang === "fr" ? `${sign}${digits}${s.frPost}` : `${sign}${s.pre}${digits}`;
}

/** NkapBook's subscription prices and other platform amounts, always FCFA. */
export const formatFcfa = (amount: number, lang: Lang = "en") => formatMoney(amount, lang, "XAF");
