"use client";
import { useActionState, useState } from "react";
import { fill, type Dict, type Lang } from "@/i18n";
import type { ActionResult } from "@/lib/actions";
import { parseAmount } from "@/lib/forms";
import { loanInterest, termMonths } from "@/lib/loans";
import { currencyLabel, formatMoney } from "@/lib/money";
import { METHODS } from "@/lib/offline/types";

type T = Pick<Dict, "loans" | "money" | "methods" | "errors">;

export function LoanForm({ t, lang, currency, members, fund, action, opId, today }: {
  t: T; lang: Lang; currency: string; members: { id: string; name: string }[]; fund: number; opId: string; today: string;
  action: (p: ActionResult, f: FormData) => Promise<ActionResult>;
}) {
  const [state, run, pending] = useActionState<ActionResult, FormData>(action, null);
  const [borrower, setBorrower] = useState("");
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("5");
  const [basis, setBasis] = useState<"per_month" | "flat">("per_month");
  const [start, setStart] = useState(today);
  const [due, setDue] = useState(() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 3);
    return d.toISOString().slice(0, 10);
  });
  const p = parseAmount(principal) ?? 0;
  const r = Number(rate.replace(",", ".")) || 0;
  const months = start && due && due >= start ? termMonths(start, due) : 0;
  const interest = months ? loanInterest(p, r, basis, months) : 0;
  const L = t.loans;
  const f = (n: number) => formatMoney(n, lang, currency);
  const cur = currencyLabel(currency);

  return (
    <form action={run} className="stack">
      {state?.error && <p className="error" role="alert">{t.errors[state.error]}</p>}
      <input type="hidden" name="op_id" value={opId} />
      <div className="field">
        <label htmlFor="member_id">{L.borrower}</label>
        <select id="member_id" name="member_id" className="input" required value={borrower} onChange={(e) => setBorrower(e.target.value)}>
          <option value="" disabled>—</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div className="grid2">
        <div className="field">
          <label htmlFor="principal">{fill(L.principal, { cur })}</label>
          <input id="principal" name="principal" className="input num" inputMode="numeric" required value={principal} onChange={(e) => setPrincipal(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rate">{L.rate}</label>
          <input id="rate" name="rate" className="input num" inputMode="decimal" required value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 4 }}>{L.basis}</legend>
        <div className="segmented">
          <label><input type="radio" name="basis" value="per_month" checked={basis === "per_month"} onChange={() => setBasis("per_month")} /><span>{L.perMonth}</span></label>
          <label><input type="radio" name="basis" value="flat" checked={basis === "flat"} onChange={() => setBasis("flat")} /><span>{L.flat}</span></label>
        </div>
      </fieldset>
      <div className="grid2">
        <div className="field">
          <label htmlFor="start_date">{L.start}</label>
          <input id="start_date" name="start_date" type="date" className="input" required value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="due_date">{L.due}</label>
          <input id="due_date" name="due_date" type="date" className="input" required min={start} value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>
      {p > 0 && months > 0 && (
        <p className="note num" aria-live="polite">{fill(L.summary, { months, interest: f(interest), total: f(p + interest) })}</p>
      )}
      {p > fund && <p className="error">{fill(L.notEnough, { amount: f(fund) })}</p>}
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600 }}>{L.guarantors}</legend>
        <span className="hint">{L.guarantorsHint}</span>
        <div style={{ maxHeight: 220, overflowY: "auto" }}>
          {members.filter((m) => m.id !== borrower).map((m) => (
            <label key={m.id} className="check"><input type="checkbox" name="guarantors" value={m.id} /><span>{m.name}</span></label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="method">{t.money.method}</label>
        <select id="method" name="method" className="input" defaultValue="cash">
          {METHODS.map((m) => <option key={m} value={m}>{t.methods[m]}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="note">{t.money.note}</label>
        <input id="note" name="note" className="input" maxLength={500} />
      </div>
      <button className="btn btn-block" disabled={pending || !borrower || p <= 0}>{L.give}</button>
    </form>
  );
}
