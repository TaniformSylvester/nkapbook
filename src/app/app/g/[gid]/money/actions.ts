"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorKey, type ActionResult } from "@/lib/actions";
import { parseAmount } from "@/lib/forms";
import { METHODS, type Method } from "@/lib/offline/types";
import { supabaseServer } from "@/lib/supabase/server";

const UUID = /^[0-9a-f-]{36}$/i;
const FINE_TYPES = ["late_payment", "absence", "lateness", "misconduct", "custom"] as const;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const method = (f: FormData): Method => (METHODS as string[]).includes(str(f, "method")) ? (str(f, "method") as Method) : "cash";
const opId = (f: FormData) => (UUID.test(str(f, "op_id")) ? str(f, "op_id") : randomUUID());

/** Send ops through sync_ops (same idempotent path as meeting mode). */
async function run(gid: string, ops: Record<string, unknown>[]): Promise<ActionResult> {
  const sb = await supabaseServer();
  const at = new Date().toISOString();
  const { data, error } = await sb.rpc("sync_ops", { p_ops: ops.map((o) => ({ at, ...o })) });
  if (error) return { error: errorKey(error) };
  const bad = (data as { ok: boolean; error?: string }[]).find((r) => !r.ok);
  if (bad) return { error: errorKey({ message: bad.error }), message: bad.error };
  revalidatePath(`/app/g/${gid}`, "layout");
  return { ok: true };
}

export async function recordFund(gid: string, _p: ActionResult, f: FormData): Promise<ActionResult> {
  const amount = parseAmount(str(f, "amount"));
  const member = str(f, "member_id");
  if (!amount) return { error: "invalid" };
  return run(gid, [{
    type: str(f, "kind") === "fund_withdrawal" ? "fund_withdrawal" : "fund_deposit",
    id: opId(f), group_id: gid, member_id: UUID.test(member) ? member : null,
    amount, method: method(f), note: str(f, "note").slice(0, 500),
  }]);
}

export async function addFine(gid: string, _p: ActionResult, f: FormData): Promise<ActionResult> {
  const amount = parseAmount(str(f, "amount"));
  const type = str(f, "fine_type");
  if (!amount || !UUID.test(str(f, "member_id")) || !(FINE_TYPES as readonly string[]).includes(type)) return { error: "invalid" };
  return run(gid, [{ type: "fine", id: opId(f), group_id: gid, member_id: str(f, "member_id"), fine_type: type, amount, note: str(f, "note").slice(0, 500) }]);
}

export async function payFine(gid: string, fineId: string, amount: number, id: string) {
  await run(gid, [{ type: "fine_payment", id, fine_id: fineId, amount, method: "cash" }]);
}

export async function reverseEntry(gid: string, entryId: string, _p: ActionResult, f: FormData): Promise<ActionResult> {
  const reason = str(f, "reason");
  if (reason.length < 3 || !UUID.test(entryId)) return { error: "invalid" };
  return run(gid, [{ type: "reverse", id: opId(f), reverses: entryId, reason: reason.slice(0, 500) }]);
}

export async function addRule(gid: string, _p: ActionResult, f: FormData): Promise<ActionResult> {
  const amount = parseAmount(str(f, "amount"));
  const type = str(f, "fine_type");
  if (!amount || !(FINE_TYPES as readonly string[]).includes(type)) return { error: "invalid" };
  const sb = await supabaseServer();
  const { error } = await sb.from("fine_rules").insert({ group_id: gid, type, amount, label: str(f, "label").slice(0, 80) || null });
  if (error) return { error: errorKey(error) };
  revalidatePath(`/app/g/${gid}`, "layout");
  return { ok: true };
}

export async function toggleRule(gid: string, ruleId: string, active: boolean) {
  const sb = await supabaseServer();
  await sb.from("fine_rules").update({ active }).eq("id", ruleId).eq("group_id", gid);
  revalidatePath(`/app/g/${gid}`, "layout");
}

export async function applyRules(gid: string, meetingId: string, _p: ActionResult): Promise<ActionResult> {
  if (!UUID.test(meetingId)) return { error: "invalid" };
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("apply_fine_rules", { p_meeting: meetingId });
  if (error) return { error: errorKey(error) };
  revalidatePath(`/app/g/${gid}`, "layout");
  return { ok: true, message: String(data ?? 0) };
}

export async function giveLoan(gid: string, _p: ActionResult, f: FormData): Promise<ActionResult> {
  const principal = parseAmount(str(f, "principal"));
  const rate = Number(str(f, "rate").replace(",", "."));
  const start = str(f, "start_date");
  const due = str(f, "due_date");
  const member = str(f, "member_id");
  if (!principal || !UUID.test(member) || !(rate >= 0 && rate <= 100) || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(due) || due < start) {
    return { error: "invalid" };
  }
  const id = opId(f);
  const res = await run(gid, [{
    type: "loan", id, group_id: gid, member_id: member, principal, rate,
    basis: str(f, "basis") === "flat" ? "flat" : "per_month", start_date: start, due_date: due,
    method: method(f), note: str(f, "note").slice(0, 500),
    guarantors: f.getAll("guarantors").map(String).filter((g) => UUID.test(g) && g !== member),
  }]);
  if (res?.error) return res;
  redirect(`/app/g/${gid}/money/loans/${id}`);
}

export async function loanEntry(gid: string, loanId: string, kind: "loan_repayment" | "loan_interest", _p: ActionResult, f: FormData): Promise<ActionResult> {
  const amount = parseAmount(str(f, "amount"));
  if (!amount || !UUID.test(loanId)) return { error: "invalid" };
  if (kind === "loan_interest" && str(f, "reason").length < 3) return { error: "invalid" };
  return run(gid, [{ type: kind, id: opId(f), loan_id: loanId, amount, method: method(f), momo_ref: str(f, "momo_ref"), reason: str(f, "reason") }]);
}

export async function addGuarantor(gid: string, loanId: string, f: FormData) {
  const member = str(f, "member_id");
  if (!UUID.test(member) || !UUID.test(loanId)) return;
  const sb = await supabaseServer();
  await sb.from("loan_guarantors").insert({ group_id: gid, loan_id: loanId, member_id: member });
  revalidatePath(`/app/g/${gid}/money/loans/${loanId}`);
}

export async function removeGuarantor(gid: string, loanId: string, memberId: string) {
  const sb = await supabaseServer();
  await sb.from("loan_guarantors").delete().eq("loan_id", loanId).eq("member_id", memberId);
  revalidatePath(`/app/g/${gid}/money/loans/${loanId}`);
}

export async function createEvent(gid: string, eventId: string, _p: ActionResult, f: FormData): Promise<ActionResult> {
  const title = str(f, "title").slice(0, 120);
  const def = parseAmount(str(f, "amount"));
  const forMember = str(f, "for_member_id");
  const due = str(f, "due_date");
  if (!title || !def) return { error: "invalid" };
  const amounts = [...f.entries()]
    .filter(([k]) => k.startsWith("amt_") && UUID.test(k.slice(4)))
    .map(([k, v]) => ({ member_id: k.slice(4), amount: parseAmount(String(v)) ?? 0 }))
    .filter((a) => a.amount > 0);
  const sb = await supabaseServer();
  const { error } = await sb.rpc("create_event", {
    p_id: eventId, p_group: gid, p_title: title,
    p_kind: (["death", "birth", "wedding", "other"] as const).find((k) => k === str(f, "kind")) ?? "other",
    p_default: def, p_due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null,
    p_for_member: UUID.test(forMember) ? forMember : null, p_amounts: amounts,
  });
  if (error) return { error: errorKey(error) };
  revalidatePath(`/app/g/${gid}`, "layout");
  redirect(`/app/g/${gid}/money/events/${eventId}`);
}

export async function payEvent(gid: string, eventId: string, memberId: string, amount: number, id: string) {
  await run(gid, [{ type: "event_payment", id, event_id: eventId, member_id: memberId, amount, method: "cash" }]);
}

export async function eventPayout(gid: string, eventId: string, _p: ActionResult, f: FormData): Promise<ActionResult> {
  const amount = parseAmount(str(f, "amount"));
  if (!amount) return { error: "invalid" };
  return run(gid, [{ type: "event_payout", id: opId(f), event_id: eventId, amount, method: method(f) }]);
}
