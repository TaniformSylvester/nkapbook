"use client";
export function PrintButton({ label }: { label: string }) {
  return <button className="btn btn-block no-print" onClick={() => window.print()}>{label}</button>;
}
