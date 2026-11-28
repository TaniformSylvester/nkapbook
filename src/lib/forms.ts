import { isLang, type Lang } from "@/i18n";
import { isCurrency, type Currency } from "@/lib/money";
import { FREQUENCIES, type Frequency } from "@/lib/types";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** "5 000", "5,000" or "5000" -> 5000. Whole amounts only (no cents), in the group's currency. */
export function parseAmount(v: string): number | null {
  const d = v.replace(/[\s,. ]/g, "");
  if (!/^\d{1,12}$/.test(d)) return null;
  const n = Number(d);
  return n > 0 ? n : null;
}

export type GroupInput = {
  name: string;
  town: string | null;
  language: Lang;
  frequency: Frequency;
  meeting_day: number;
  contribution_per_hand: number;
  start_date: string;
  currency?: Currency; // left out when the form doesn't send it (currency locked)
};

export function readGroupForm(f: FormData): GroupInput | null {
  const name = str(f, "name");
  const language = str(f, "language");
  const frequency = str(f, "frequency") as Frequency;
  const meeting_day = Number(str(f, "meeting_day"));
  const contribution = parseAmount(str(f, "contribution"));
  const start_date = str(f, "start_date");
  if (name.length < 2 || name.length > 80) return null;
  if (!isLang(language) || !FREQUENCIES.includes(frequency)) return null;
  if (!Number.isInteger(meeting_day)) return null;
  if (frequency === "monthly" ? meeting_day < 1 || meeting_day > 28 : meeting_day < 0 || meeting_day > 6) return null;
  if (!contribution || !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) return null;
  const cur = str(f, "currency");
  if (cur && !isCurrency(cur)) return null;
  return { ...(cur ? { currency: cur as Currency } : {}), name, town: str(f, "town").slice(0, 80) || null, language, frequency, meeting_day, contribution_per_hand: contribution, start_date };
}
