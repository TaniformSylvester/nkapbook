"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { normalizeCmPhone, toE164 } from "@/lib/phone";
import { rateLimit } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export type LoginState = {
  step: "phone" | "code";
  phone?: string;
  error?: "phone" | "code" | "tooMany" | "generic";
};

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function sendCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const phone = normalizeCmPhone(String(form.get("phone") ?? ""));
  if (!phone) return { step: "phone", error: "phone" };

  // Our own limits, on top of Supabase's: 5 codes per number per 15 min, 20 per IP per hour.
  const ip = await clientIp();
  const okPhone = await rateLimit("otp_send_phone", phone, 5, 900);
  const okIp = await rateLimit("otp_send_ip", ip, 20, 3600);
  if (!okPhone || !okIp) return { step: "phone", phone, error: "tooMany" };

  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({ phone: toE164(phone), options: { channel: "sms" } });
  if (error) {
    console.error("signInWithOtp", error.message);
    return { step: "phone", phone, error: error.status === 429 ? "tooMany" : "generic" };
  }
  return { step: "code", phone };
}

export async function verifyCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const phone = normalizeCmPhone(String(form.get("phone") ?? ""));
  const token = String(form.get("code") ?? "").replace(/\D/g, "");
  if (!phone) return { step: "phone", error: "phone" };
  if (token.length !== 6) return { step: "code", phone, error: "code" };

  if (!(await rateLimit("otp_verify_phone", phone, 10, 900))) return { step: "code", phone, error: "tooMany" };

  const sb = await supabaseServer();
  const { error } = await sb.auth.verifyOtp({ phone: toE164(phone), token, type: "sms" });
  if (error) return { step: "code", phone, error: error.status === 429 ? "tooMany" : "code" };

  // Link any invitations waiting for this phone number.
  await sb.rpc("accept_invites");
  redirect("/app");
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/");
}
