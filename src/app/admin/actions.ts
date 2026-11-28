"use server";
import { revalidatePath } from "next/cache";
import { parseAmount } from "@/lib/forms";
import { METHODS } from "@/lib/offline/types";
import { supabaseServer } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

export async function setPlan(gid: string, form: FormData) {
  const plan = String(form.get("plan"));
  if (!["pilot", "free", "trial", "paid"].includes(plan) || !UUID.test(gid)) return;
  const sb = await supabaseServer();
  await sb.rpc("admin_set_plan", { p_group_id: gid, p_plan: plan }); // the database checks you are the platform admin
  revalidatePath("/admin");
}

export async function recordSubscription(gid: string, form: FormData) {
  const months = Number(form.get("months"));
  const amount = parseAmount(String(form.get("amount") ?? ""));
  const method = String(form.get("method"));
  if (!UUID.test(gid) || ![1, 3, 6, 12].includes(months) || !amount || !(METHODS as string[]).includes(method)) return;
  const sb = await supabaseServer();
  await sb.rpc("admin_record_subscription", {
    p_group: gid, p_months: months, p_amount: amount, p_method: method,
    p_reference: String(form.get("reference") ?? "").slice(0, 64), p_note: null,
  });
  revalidatePath("/admin");
}
