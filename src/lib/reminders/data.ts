import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lang } from "@/i18n";
import { fmtDate } from "@/lib/dates";
import { SITE_URL } from "@/lib/env";
import { nextMeetingDate } from "@/lib/schedule";
import type { Group } from "@/lib/types";
import { composeReminder } from "./compose";

export type ReminderRow = {
  member_id: string; name: string; phone: string | null; text: string; amount: number; sent_at: string | null; opted_in: boolean;
};

/** The meeting date reminders are for: the open meeting, else the next turn, else the next scheduled day. */
export async function defaultReminderDate(sb: SupabaseClient, g: Group): Promise<string> {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Douala" });
  const { data: open } = await sb.from("meetings").select("date").eq("group_id", g.id).eq("status", "open").gte("date", today).order("date").limit(1).maybeSingle();
  if (open) return open.date as string;
  const { data: slot } = await sb.from("cycle_slots").select("planned_date, cycles!inner(status)").eq("group_id", g.id)
    .eq("cycles.status", "active").is("meeting_id", null).gte("planned_date", today).order("position").limit(1).maybeSingle();
  return (slot?.planned_date as string | undefined) ?? nextMeetingDate(g, today);
}

export async function loadReminderRows(sb: SupabaseClient, g: Group, date: string, lang: Lang, withLink: boolean): Promise<ReminderRow[]> {
  const [{ data: bals }, { data: members }, { data: links }, { data: slots }, { data: sent }, { data: meeting }] = await Promise.all([
    sb.from("member_balances").select("member_id, contribution_owing, contributions_paid").eq("group_id", g.id),
    sb.from("members").select("id, name, phone, hands, whatsapp_opt_in").eq("group_id", g.id).eq("status", "active").order("name"),
    withLink ? sb.from("member_links").select("member_id, token").eq("group_id", g.id).is("revoked_at", null) : Promise.resolve({ data: [] }),
    sb.from("cycle_slots").select("member_id, planned_date, position, cycles!inner(status)").eq("group_id", g.id)
      .eq("cycles.status", "active").is("meeting_id", null).order("position"),
    sb.from("reminder_log").select("member_id, sent_at").eq("group_id", g.id).eq("for_date", date).order("sent_at"),
    sb.from("meetings").select("id").eq("group_id", g.id).eq("date", date).maybeSingle(),
  ]);
  const bal = new Map((bals ?? []).map((b) => [b.member_id as string, b]));
  const link = new Map((links ?? []).map((l) => [l.member_id as string, l.token as string]));
  const turn = new Map<string, string>();
  for (const s of slots ?? []) if (!turn.has(s.member_id as string)) turn.set(s.member_id as string, s.planned_date as string);
  const last = new Map<string, string>();
  for (const r of sent ?? []) last.set(r.member_id as string, r.sent_at as string);
  const day = fmtDate(lang, date, { weekday: "long", day: "numeric", month: "long" });

  return (members ?? []).map((m) => {
    const amount = (m.hands as number) * g.contribution_per_hand;
    const b = bal.get(m.id as string);
    // if the meeting is already open, its dues are in the balance: don't count them as "from before"
    const owing = Math.max(0, Number(b?.contribution_owing ?? 0) - (meeting ? amount : 0));
    const t = turn.get(m.id as string);
    const token = link.get(m.id as string);
    return {
      member_id: m.id as string,
      name: m.name as string,
      phone: m.phone as string | null,
      amount,
      opted_in: m.whatsapp_opt_in as boolean,
      sent_at: last.get(m.id as string) ?? null,
      text: composeReminder(lang, {
        name: m.name as string, group: g.name, currency: g.currency, amount, day, paid: Number(b?.contributions_paid ?? 0), owing,
        turn: t ? fmtDate(lang, t, { day: "numeric", month: "long" }) : null,
        url: token ? `${SITE_URL}/m/${token}` : null,
      }),
    };
  });
}
