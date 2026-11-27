"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorKey, type ActionResult } from "@/lib/actions";
import { supabaseServer } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;

export async function openMeeting(gid: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const date = String(form.get("date") ?? "");
  if (!UUID.test(gid) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "invalid" };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("open_meeting", { p_group: gid, p_date: date });
  if (error || !data) return { error: errorKey(error) };
  revalidatePath(`/app/g/${gid}`, "layout");
  redirect(`/app/g/${gid}/meetings/${data as string}`);
}

function readOrder(form: FormData) {
  try {
    const v = JSON.parse(String(form.get("order") ?? "null"));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

export async function saveCycle(gid: string, cycleId: string | null, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const method = form.get("method") === "manual" ? "manual" : "draw";
  const first = String(form.get("first_date") ?? "");
  const witness = String(form.get("witness") ?? "").slice(0, 500) || null;
  const order = method === "manual" ? readOrder(form) : null;
  if (!UUID.test(gid) || (cycleId && !UUID.test(cycleId)) || !/^\d{4}-\d{2}-\d{2}$/.test(first)) return { error: "invalid" };
  if (method === "manual" && !order) return { error: "invalid" };
  const sb = await supabaseServer();
  const { error } = cycleId
    ? await sb.rpc("reorder_cycle", { p_cycle: cycleId, p_method: method, p_first_date: first, p_order: order, p_witness: witness })
    : await sb.rpc("create_cycle", { p_group: gid, p_method: method, p_first_date: first, p_order: order, p_witness: witness });
  if (error) return { error: errorKey(error), message: error.message };
  revalidatePath(`/app/g/${gid}`, "layout");
  redirect(`/app/g/${gid}/cycle`);
}

export async function startCycle(gid: string, cycleId: string) {
  const sb = await supabaseServer();
  await sb.rpc("start_cycle", { p_cycle: cycleId });
  revalidatePath(`/app/g/${gid}`, "layout");
}

export async function completeCycle(gid: string, cycleId: string) {
  const sb = await supabaseServer();
  await sb.rpc("complete_cycle", { p_cycle: cycleId });
  revalidatePath(`/app/g/${gid}`, "layout");
}
