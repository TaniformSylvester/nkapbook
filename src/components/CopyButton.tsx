"use client";
import { useState } from "react";

export function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-block"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          window.prompt(label, text); // old browsers: let them copy by hand
        }
        setOk(true);
        setTimeout(() => setOk(false), 2000);
      }}
    >
      {ok ? `✓ ${done}` : label}
    </button>
  );
}
