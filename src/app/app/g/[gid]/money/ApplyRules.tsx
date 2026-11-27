"use client";
import { useActionState } from "react";
import { fill } from "@/i18n";
import type { ActionResult } from "@/lib/actions";

export function ApplyRules({ action, label, hint, done }: { action: (p: ActionResult) => Promise<ActionResult>; label: string; hint: string; done: string }) {
  const [state, run, pending] = useActionState<ActionResult>(action, null);
  return (
    <form action={run} className="stack">
      {state?.ok && <p className="note" role="status">{fill(done, { n: state.message ?? "0" })}</p>}
      <button className="btn btn-ghost btn-block" disabled={pending}>{label}</button>
      <p className="small muted">{hint}</p>
    </form>
  );
}
