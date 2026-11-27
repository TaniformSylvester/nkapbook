import "server-only";
import { headers } from "next/headers";

/** The visitor's IP as reported by Vercel's proxy (used only for rate limiting). */
export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
