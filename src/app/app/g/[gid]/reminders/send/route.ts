import { NextResponse, type NextRequest } from "next/server";
import { isLang } from "@/i18n";
import { loadReminderRows } from "@/lib/reminders/data";
import { waLinkChannel } from "@/lib/reminders/channel";
import { supabaseServer } from "@/lib/supabase/server";
import type { Group } from "@/lib/types";

// Records that the secretary sent a reminder, then opens WhatsApp with the message ready.
export async function GET(req: NextRequest, { params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const sp = req.nextUrl.searchParams;
  const mid = sp.get("m") ?? "";
  const date = sp.get("d") ?? "";
  const lang = sp.get("l");
  if (!/^[0-9a-f-]{36}$/i.test(gid) || !/^[0-9a-f-]{36}$/i.test(mid) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isLang(lang)) {
    return new NextResponse("Bad request", { status: 400 });
  }
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", req.url));
  const { data: group } = await sb.from("groups").select("*").eq("id", gid).maybeSingle<Group>();
  if (!group) return new NextResponse("Not found", { status: 404 });
  const row = (await loadReminderRows(sb, group, date, lang, sp.get("link") === "1")).find((r) => r.member_id === mid);
  if (!row?.phone) return new NextResponse("Not found", { status: 404 });

  const res = await waLinkChannel.send({ to: row.phone, text: row.text, template: { name: "contribution_due", lang, params: [] } });
  await sb.from("reminder_log").insert({ group_id: gid, member_id: mid, channel: "wa_link", sent_by: auth.user.id, for_date: date });
  return NextResponse.redirect(res.ok && res.link ? res.link : `https://wa.me/${row.phone}`, { status: 303 });
}
