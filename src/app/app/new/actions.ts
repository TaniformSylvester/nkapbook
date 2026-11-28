"use server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { errorKey, type ActionResult } from "@/lib/actions";
import { readGroupForm } from "@/lib/forms";
import { sendAdminMail } from "@/lib/notify/mail";
import { newGroupMail, type GroupRow } from "@/lib/notify/templates";
import { supabaseServer } from "@/lib/supabase/server";

export async function createGroup(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const g = readGroupForm(form);
  const yourName = String(form.get("your_name") ?? "").trim().slice(0, 80);
  if (!g || !yourName) return { error: "invalid" };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("create_group", {
    p_name: g.name,
    p_town: g.town,
    p_language: g.language,
    p_frequency: g.frequency,
    p_meeting_day: g.meeting_day,
    p_contribution_per_hand: g.contribution_per_hand,
    p_start_date: g.start_date,
    p_president_name: yourName,
    p_currency: g.currency ?? "XAF",
  });
  if (error || !data) return { error: errorKey(error) };
  const gid = data as string;
  // Tell the NkapBook admin, after the response is sent. A failed email never affects sign-up.
  after(async () => {
    const { data: row } = await sb.from("groups").select("id, name, town, plan, paid_until, created_at").eq("id", gid).maybeSingle<GroupRow>();
    if (row) await sendAdminMail(newGroupMail(row));
  });
  redirect(`/app/g/${gid}/members`);
}
