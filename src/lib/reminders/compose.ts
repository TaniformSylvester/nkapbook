import { fill, getDict, type Lang } from "@/i18n";
import { formatFcfa } from "@/lib/money";

export type ReminderData = {
  name: string; // first name is used
  group: string;
  amount: number; // due at this meeting (hands × contribution)
  day: string; // already formatted, e.g. "Sunday" or "Sunday 7 March"
  paid: number; // contributions paid so far (all time)
  owing: number; // arrears from before this meeting
  turn?: string | null; // formatted date of their next turn
  url?: string | null; // their private link
};

/** A friendly, never threatening reminder in the member's language. */
export function composeReminder(lang: Lang, d: ReminderData): string {
  const m = getDict(lang).remind.msg;
  const f = (n: number) => formatFcfa(n, lang);
  const first = d.name.trim().split(/\s+/)[0] ?? d.name;
  const parts = [
    `${fill(m.hello, { name: first })} ${fill(m.due, { amount: f(d.amount), group: d.group, day: d.day })}`,
    d.paid > 0 ? fill(m.paid, { paid: f(d.paid) }) : null,
    d.owing > 0 ? fill(m.owing, { owing: f(d.owing) }) : null,
    d.turn ? fill(m.turn, { turn: d.turn }) : null,
    d.url ? fill(m.link, { url: d.url }) : null,
    m.thanks,
  ];
  return parts.filter(Boolean).join(" ");
}
