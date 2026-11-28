import { NextResponse, type NextRequest } from "next/server";
import { automaticChannel } from "@/lib/reminders/channel";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fmtDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { Group } from "@/lib/types";

/**
 * Phase 2 (off by default): automatic WhatsApp reminders the day before a meeting, sent with an
 * approved template, only to members who agreed (whatsapp_opt_in). Call daily from a scheduler with
 * "Authorization: Bearer <CRON_SECRET>". Does nothing unless FEATURE_WA_CLOUD=true and the provider is configured.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const channel = automaticChannel();
  if (!channel) return NextResponse.json({ skipped: "automatic reminders are off" });

  const sb = supabaseAdmin();
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "Africa/Douala" });
  const { data: slots } = await sb.from("cycle_slots").select("group_id, cycles!inner(status)")
    .eq("planned_date", tomorrow).eq("cycles.status", "active").is("meeting_id", null);
  const groupIds = [...new Set((slots ?? []).map((s) => s.group_id as string))];
  let sent = 0;
  const errors: string[] = [];
  for (const gid of groupIds) {
    const { data: g } = await sb.from("groups").select("*").eq("id", gid).eq("status", "active").maybeSingle<Group>();
    if (!g) continue;
    const [{ data: members }, { data: done }] = await Promise.all([
      sb.from("members").select("id, name, phone, hands").eq("group_id", gid).eq("status", "active").eq("whatsapp_opt_in", true).not("phone", "is", null),
      sb.from("reminder_log").select("member_id").eq("group_id", gid).eq("for_date", tomorrow).eq("channel", "wa_cloud"),
    ]);
    const already = new Set((done ?? []).map((d) => d.member_id as string));
    for (const m of members ?? []) {
      if (already.has(m.id as string)) continue;
      const first = String(m.name).split(" ")[0] ?? "";
      const r = await channel.send({
        to: m.phone as string,
        text: "",
        template: {
          name: process.env.WA_CLOUD_TEMPLATE ?? "nkapbook_contribution_due",
          lang: g.language,
          params: [first, formatMoney((m.hands as number) * g.contribution_per_hand, g.language, g.currency), g.name, fmtDate(g.language, tomorrow, { weekday: "long", day: "numeric", month: "long" })],
        },
      });
      if (r.ok) {
        sent++;
        await sb.from("reminder_log").insert({ group_id: gid, member_id: m.id, channel: "wa_cloud", for_date: tomorrow });
      } else errors.push(`${gid}/${m.id}: ${r.error}`);
    }
  }
  return NextResponse.json({ date: tomorrow, groups: groupIds.length, sent, errors });
}
