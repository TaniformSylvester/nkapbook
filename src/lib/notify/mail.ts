import "server-only";
import nodemailer from "nodemailer";
import { SUPPORT_EMAIL } from "@/lib/site";

export type Mail = { subject: string; text: string; html: string };
export type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "failed"; detail?: string };

/**
 * Sends an email to the NkapBook admin through Zoho SMTP. The password is an app-specific password
 * in SMTP_PASS (Vercel environment variable, never in the code). Does nothing if it isn't configured.
 */
export async function sendAdminMail(mail: Mail): Promise<SendResult> {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!user || !pass) return { sent: false, reason: "not_configured" };
  const port = Number(process.env.SMTP_PORT ?? 465) || 465;
  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST?.trim() || "smtppro.zoho.com",
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transport.sendMail({
      from: process.env.MAIL_FROM?.trim() || `NkapBook <${SUPPORT_EMAIL}>`,
      to: process.env.ADMIN_NOTIFY_EMAIL?.trim() || SUPPORT_EMAIL,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return { sent: true };
  } catch (e) {
    const detail = e instanceof Error ? e.message.slice(0, 200) : "unknown error";
    console.error("admin email failed:", detail);
    return { sent: false, reason: "failed", detail };
  }
}
