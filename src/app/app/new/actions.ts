"use server";
import { redirect } from "next/navigation";
import { errorKey, type ActionResult } from "@/lib/actions";
import { readGroupForm } from "@/lib/forms";
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
  });
  if (error || !data) return { error: errorKey(error) };
  redirect(`/app/g/${data as string}/members`);
}
