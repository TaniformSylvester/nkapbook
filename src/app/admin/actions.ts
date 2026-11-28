"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sendAdminMail } from "@/lib/notify/mail";
import { testMail } from "@/lib/notify/templates";
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

/** Sends a test email to the admin address, so the SMTP settings can be checked from the phone. */
export async function sendTestMail() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: me } = await sb.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
  if (!me) redirect("/admin");
  const r = await sendAdminMail(testMail());
  redirect(`/admin?mail=${r.sent ? "ok" : r.reason === "not_configured" ? "off" : "fail"}`);
}
