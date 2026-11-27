"use client";
import { useActionState, type ReactNode } from "react";
import type { ActionResult, ErrorKey } from "@/lib/actions";

type Props = {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  errors: Record<ErrorKey, string>;
  children: ReactNode;
  submit: ReactNode;
  className?: string;
  /** Shown after a successful save (when the action doesn't redirect). */
  okText?: string;
  secondary?: { name: string; value: string; label: ReactNode };
};

/** A form that shows the action's error or success message. Works with plain server actions. */
export function ActionForm({ action, errors, children, submit, className = "stack", okText, secondary }: Props) {
  const [state, run, pending] = useActionState<ActionResult, FormData>(action, null);
  return (
    <form action={run} className={className}>
      {state?.error && (
        <p className="error" role="alert">
          {errors[state.error]}
        </p>
      )}
      {state?.ok && (state.message || okText) && (
        <p className="note" role="status">
          {state.message ?? okText}
        </p>
      )}
      {children}
      <button className="btn btn-block" disabled={pending}>
        {submit}
      </button>
      {secondary && (
        <button className="btn btn-ghost btn-block" name={secondary.name} value={secondary.value} disabled={pending}>
          {secondary.label}
        </button>
      )}
    </form>
  );
}
