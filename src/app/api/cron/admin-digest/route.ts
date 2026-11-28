import { NextResponse, type NextRequest } from "next/server";
import { sendAdminMail } from "@/lib/notify/mail";
import { endingOn, endingSoonMail, weeklyMail, type GroupRow } from "@/lib/notify/templates";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Daily admin emails (Vercel Cron, see vercel.json; Vercel sends "Authorization: Bearer <CRON_SECRET>"):
 * - plans (trial or paid) ending in 7 days
 * - on Mondays (Douala time), a weekly summary. Add ?weekly=1 to send the summary now.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let data: GroupRow[] | null = null;
  try {
    const r = await supabaseAdmin()
      .from("groups").select("id, name, town, plan, paid_until, created_at").eq("status", "active").returns<GroupRow[]>();
    if (r.error) throw r.error;
    data = r.data;
  } catch (e) {
    console.error("admin digest: could not read groups", e);
    return NextResponse.json({ error: "could not read groups" }, { status: 500 });
  }

  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: "Africa/Douala" });
  const monday = now.toLocaleDateString("en-GB", { timeZone: "Africa/Douala", weekday: "long" }) === "Monday";
  const out: Record<string, unknown> = { today };

  const ending = endingSoonMail(endingOn(data ?? [], today), today);
  out.ending = ending ? await sendAdminMail(ending) : "none";
  if (monday || req.nextUrl.searchParams.get("weekly") === "1") out.weekly = await sendAdminMail(weeklyMail(data ?? [], today));
  return NextResponse.json(out);
}
