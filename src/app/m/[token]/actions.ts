"use server";
import { revalidatePath } from "next/cache";
import { clientIp } from "@/lib/client-ip";
import { supabaseAdmin } from "@/lib/supabase/admin";

const TOKEN = /^[A-Za-z0-9_-]{40,64}$/;
const UUID = /^[0-9a-f-]{36}$/i;

export async function confirmPayout(token: string, entryId: string) {
  if (!TOKEN.test(token) || !UUID.test(entryId)) return;
  await supabaseAdmin().rpc("confirm_payout", { p_token: token, p_entry: entryId, p_ip: await clientIp() });
  revalidatePath(`/m/${token}`);
}
