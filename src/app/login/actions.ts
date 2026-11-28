"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp } from "@/lib/client-ip";
import { normalizePhone, toE164 } from "@/lib/phone";
import { rateLimit } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

// Sign-in works as plain page-to-page steps, so it also works on phones where scripts don't run.
// The number waits in a short-lived private cookie between "send code" and "enter code".
const PHONE_COOKIE = "nk_otp_phone";

export type LoginError = "phone" | "code" | "tooMany" | "generic";

async function rememberPhone(phone: string) {
  (await cookies()).set(PHONE_COOKIE, phone, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 15 * 60 });
}

export async function pendingPhone(): Promise<string | null> {
  const v = (await cookies()).get(PHONE_COOKIE)?.value ?? "";
  return /^[1-9]\d{7,14}$/.test(v) ? v : null;
}

export async function sendCode(form: FormData) {
  const phone = normalizePhone(String(form.get("phone") ?? ""));
  if (!phone) redirect("/login?e=phone");

  // Our own limits, on top of Supabase's: 5 codes per number per 15 min, 20 per IP per hour.
  const ip = await clientIp();
  const okPhone = await rateLimit("otp_send_phone", phone, 5, 900);
  const okIp = await rateLimit("otp_send_ip", ip, 20, 3600);
  await rememberPhone(phone);
  if (!okPhone || !okIp) redirect("/login?e=tooMany");

  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({ phone: toE164(phone), options: { channel: "sms" } });
  if (error) {
    console.error("signInWithOtp", error.message);
    redirect(`/login?e=${error.status === 429 ? "tooMany" : "generic"}`);
  }
  redirect("/login?step=code");
}

export async function verifyCode(form: FormData) {
  const phone = await pendingPhone();
  if (!phone) redirect("/login");
  const token = String(form.get("code") ?? "").replace(/\D/g, "");
  if (token.length !== 6) redirect("/login?step=code&e=code");

  if (!(await rateLimit("otp_verify_phone", phone, 10, 900))) redirect("/login?step=code&e=tooMany");

  const sb = await supabaseServer();
  const { error } = await sb.auth.verifyOtp({ phone: toE164(phone), token, type: "sms" });
  if (error) redirect(`/login?step=code&e=${error.status === 429 ? "tooMany" : "code"}`);

  (await cookies()).delete(PHONE_COOKIE);
  // Link any invitations waiting for this phone number.
  await sb.rpc("accept_invites");
  redirect("/app");
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/");
}
