"use client";
import { useFormStatus } from "react-dom";

/** A submit button that shows it's working (when scripts run) and still submits when they don't. */
export function SubmitButton({ children, className = "btn btn-block" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-busy={pending}>
      {children}
    </button>
  );
}
