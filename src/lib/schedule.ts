import type { Frequency } from "./types";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The next meeting on or after `from` (YYYY-MM-DD), from the group's meeting day. */
export function nextMeetingDate(g: { frequency: Frequency; meeting_day: number }, from: string): string {
  const d = new Date(`${from}T00:00:00Z`);
  if (g.frequency === "monthly") {
    const day = Math.min(28, Math.max(1, g.meeting_day));
    const cand = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day));
    if (cand < d) cand.setUTCMonth(cand.getUTCMonth() + 1);
    return iso(cand);
  }
  const diff = (g.meeting_day - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + diff);
  return iso(d);
}
