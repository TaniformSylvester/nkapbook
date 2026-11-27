"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function setPlan(gid: string, form: FormData) {
  const plan = String(form.get("plan"));
  if (!["pilot", "free", "paid"].includes(plan) || !/^[0-9a-f-]{36}$/i.test(gid)) return;
  const sb = await supabaseServer();
  await sb.rpc("admin_set_plan", { p_group_id: gid, p_plan: plan }); // the database checks you are the platform admin
  revalidatePath("/admin");
}
