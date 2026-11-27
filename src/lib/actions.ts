// Shared shape for server action results used with useActionState.
export type ErrorKey = "generic" | "notAllowed" | "needsPresident" | "invalid" | "phone" | "alreadyInvited";
export type ActionResult = { ok?: boolean; error?: ErrorKey; message?: string; field?: string } | null;

/** Map a Postgres / PostgREST error to a friendly key. */
export function errorKey(e: { message?: string; code?: string } | null | undefined): ErrorKey {
  const m = e?.message ?? "";
  if (/needs a president/.test(m)) return "needsPresident";
  if (e?.code === "42501" || /row-level security|not allowed|permission denied|only the president/.test(m)) return "notAllowed";
  if (/official_invites_open/.test(m)) return "alreadyInvited";
  if (/cm_phone/.test(m)) return "phone";
  if (e?.code === "23514" || e?.code === "22P02") return "invalid";
  return "generic";
}
