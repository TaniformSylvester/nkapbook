import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";

/**
 * Service-role client. SERVER ONLY: bypasses RLS. Used only for
 * rate limiting and the member-link functions, which check access themselves.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Returns true when allowed. Fails open only if the limiter itself is unreachable. */
export async function rateLimit(bucket: string, key: string, max: number, windowSeconds: number) {
  try {
    const { data, error } = await supabaseAdmin().rpc("check_rate_limit", {
      p_bucket: bucket,
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) throw error;
    return data === true;
  } catch (e) {
    console.error("rate limit check failed", e);
    return true;
  }
}
