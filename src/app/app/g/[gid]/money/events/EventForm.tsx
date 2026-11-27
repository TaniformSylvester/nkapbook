"use client";
import { useActionState, useState } from "react";
import type { Dict } from "@/i18n";
import type { ActionResult } from "@/lib/actions";

export function EventForm({ t, members, action }: {
  t: Pick<Dict, "events" | "errors" | "money">; members: { id: string; name: string }[];
  action: (p: ActionResult, f: FormData) => Promise<ActionResult>;
}) {
  const [state, run, pending] = useActionState<ActionResult, FormData>(action, null);
  const [amount, setAmount] = useState("2000");
  const [forMember, setForMember] = useState("");
  const E = t.events;
  return (
    <form action={run} className="stack">
      {state?.error && <p className="error" role="alert">{t.errors[state.error]}</p>}
      <div className="field">
        <label htmlFor="title">{E.name}</label>
        <input id="title" name="title" className="input" required maxLength={120} placeholder={E.namePlaceholder} />
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="kind">{E.kind}</label>
          <select id="kind" name="kind" className="input" defaultValue="death">
            {(["death", "birth", "wedding", "other"] as const).map((k) => <option key={k} value={k}>{E.kinds[k]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="due_date">{E.due}</label>
          <input id="due_date" name="due_date" type="date" className="input" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="for_member_id">{E.forMember}</label>
        <select id="for_member_id" name="for_member_id" className="input" value={forMember} onChange={(e) => setForMember(e.target.value)}>
          <option value="">{E.forNobody}</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="amount">{E.perMember}</label>
        <input id="amount" name="amount" className="input num" inputMode="numeric" required value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <details>
        <summary className="btn-link">{E.adjust}</summary>
        <ul className="list">
          {members.map((m) => (
            <li key={m.id} className="row">
              <label className="row-main" htmlFor={`amt_${m.id}`}>{m.name}</label>
              {/* the person the money is for doesn't pay by default */}
              <input id={`amt_${m.id}`} name={`amt_${m.id}`} key={`${m.id}-${amount}-${forMember}`} className="input num" style={{ width: 110 }}
                inputMode="numeric" defaultValue={m.id === forMember ? "0" : amount} />
            </li>
          ))}
        </ul>
      </details>
      <button className="btn btn-block" disabled={pending}>{E.create}</button>
    </form>
  );
}
