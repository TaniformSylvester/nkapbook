import { randomUUID } from "node:crypto";
import type { Dict } from "@/i18n";
import { METHODS } from "@/lib/offline/types";

/** A fresh id per form render, so pressing Save twice never records twice. */
export function OpId() {
  return <input type="hidden" name="op_id" value={randomUUID()} />;
}

export function MethodSelect({ t, id = "method" }: { t: Dict; id?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{t.money.method}</label>
      <select id={id} name="method" className="input" defaultValue="cash">
        {METHODS.map((m) => <option key={m} value={m}>{t.methods[m]}</option>)}
      </select>
    </div>
  );
}

export function AmountField({ label, id = "amount", name = "amount", defaultValue }: { label: string; id?: string; name?: string; defaultValue?: number }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} className="input num" inputMode="numeric" required defaultValue={defaultValue} autoComplete="off" />
    </div>
  );
}

export function MemberSelect({ members, label, id = "member_id", name = "member_id", optional }: {
  members: { id: string; name: string }[]; label: string; id?: string; name?: string; optional?: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} className="input" required={!optional} defaultValue="">
        <option value="" disabled={!optional}>{optional ?? "—"}</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </div>
  );
}
