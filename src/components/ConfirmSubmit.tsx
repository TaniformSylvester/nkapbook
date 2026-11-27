"use client";

/** A submit button that asks "are you sure?" first. */
export function ConfirmSubmit({ label, question, className = "btn-link" }: { label: string; question: string; className?: string }) {
  return (
    <button className={className} onClick={(e) => { if (!confirm(question)) e.preventDefault(); }}>
      {label}
    </button>
  );
}
