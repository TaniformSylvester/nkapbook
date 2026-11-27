"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorKey, type ActionResult } from "@/lib/actions";
import { readGroupForm } from "@/lib/forms";
import { parseMemberList } from "@/lib/parse-members";
import { normalizeCmPhone } from "@/lib/phone";
import { supabaseServer } from "@/lib/supabase/server";
import { OFFICIAL_ROLES, ROLES, type Role } from "@/lib/types";

const UUID = /^[0-9a-f-]{36}$/i;

async function client() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/login");
  return { sb, uid: data.user.id };
}

function readMember(form: FormData) {
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const rawPhone = String(form.get("phone") ?? "").trim();
  const phone = rawPhone ? normalizeCmPhone(rawPhone) : null;
  const hands = Number(form.get("hands") ?? 1);
  if (!name) return { error: "invalid" as const };
  if (rawPhone && !phone) return { error: "phone" as const };
  if (!Number.isInteger(hands) || hands < 1 || hands > 10) return { error: "invalid" as const };
  return { name, phone, hands, whatsapp_opt_in: form.get("opt_in") === "on" };
}

export async function addMember(gid: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!UUID.test(gid)) return { error: "invalid" };
  const m = readMember(form);
  if ("error" in m) return { error: m.error };
  const { sb } = await client();
  const { error } = await sb.from("members").insert({ group_id: gid, ...m });
  if (error) return { error: errorKey(error) };
  revalidatePath(`/app/g/${gid}`, "layout");
  if (form.get("again") === "1") return { ok: true, message: `✓ ${m.name}` };
  redirect(`/app/g/${gid}/members`);
}

export async function addMembersBulk(gid: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!UUID.test(gid)) return { error: "invalid" };
  const rows = parseMemberList(String(form.get("list") ?? "").slice(0, 20000)).filter((r) => r.ok);
  if (rows.length === 0 || rows.length > 200) return { error: "invalid" };
  const { sb } = await client();
  const { error } = await sb
    .from("members")
    .insert(rows.map((r) => ({ group_id: gid, name: r.name, phone: r.phone, hands: r.hands })));
  if (error) return { error: errorKey(error) };
  revalidatePath(`/app/g/${gid}`, "layout");
  redirect(`/app/g/${gid}/members?added=${rows.length}`);
}

export async function updateMember(gid: string, mid: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!UUID.test(gid) || !UUID.test(mid)) return { error: "invalid" };
  const m = readMember(form);
  if ("error" in m) return { error: m.error };
  const status = form.get("status") === "left" ? "left" : "active";
  const { sb } = await client();
  const { data, error } = await sb
    .from("members")
    .update({ ...m, status })
    .eq("id", mid)
    .eq("group_id", gid)
    .select("id");
  if (error) return { error: errorKey(error) };
  if (!data?.length) return { error: "notAllowed" };
  revalidatePath(`/app/g/${gid}`, "layout");
  redirect(`/app/g/${gid}/members`);
}

export async function changeRole(gid: string, mid: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const role = String(form.get("role")) as Role;
  if (!UUID.test(gid) || !UUID.test(mid) || !ROLES.includes(role)) return { error: "invalid" };
  const { sb } = await client();
  const { data, error } = await sb.from("members").update({ role }).eq("id", mid).eq("group_id", gid).select("id");
  if (error) return { error: errorKey(error) };
  if (!data?.length) return { error: "notAllowed" };
  revalidatePath(`/app/g/${gid}`, "layout");
  return { ok: true };
}

export async function inviteOfficial(gid: string, mid: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  const role = String(form.get("role")) as Role;
  if (!UUID.test(gid) || !UUID.test(mid) || !(OFFICIAL_ROLES as string[]).includes(role)) return { error: "invalid" };
  const { sb, uid } = await client();
  const { data: member } = await sb.from("members").select("phone").eq("id", mid).eq("group_id", gid).maybeSingle();
  if (!member?.phone) return { error: "phone" };
  const { error } = await sb
    .from("official_invites")
    .insert({ group_id: gid, member_id: mid, phone: member.phone, role, invited_by: uid });
  if (error) return { error: errorKey(error) };
  revalidatePath(`/app/g/${gid}`, "layout");
  return { ok: true };
}

export async function cancelInvite(gid: string, inviteId: string) {
  if (!UUID.test(gid) || !UUID.test(inviteId)) return;
  const { sb, uid } = await client();
  await sb.from("official_invites").update({ cancelled_at: new Date().toISOString(), cancelled_by: uid }).eq("id", inviteId);
  revalidatePath(`/app/g/${gid}`, "layout");
}

export async function updateGroup(gid: string, _prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!UUID.test(gid)) return { error: "invalid" };
  const g = readGroupForm(form);
  if (!g) return { error: "invalid" };
  const { sb } = await client();
  const { data, error } = await sb
    .from("groups")
    .update({
      ...g,
      fines_go_to_fund: form.get("fines_to_fund") === "on",
      collectors_per_meeting: Math.min(10, Math.max(1, Number(form.get("collectors")) || 1)),
    })
    .eq("id", gid)
    .select("id");
  if (error) return { error: errorKey(error) };
  if (!data?.length) return { error: "notAllowed" };
  revalidatePath(`/app/g/${gid}`, "layout");
  return { ok: true };
}

export async function resetLink(gid: string, mid: string) {
  if (!UUID.test(gid) || !UUID.test(mid)) return;
  const { sb } = await client();
  await sb.rpc("reset_member_link", { p_member_id: mid });
  revalidatePath(`/app/g/${gid}/members/${mid}`);
}
