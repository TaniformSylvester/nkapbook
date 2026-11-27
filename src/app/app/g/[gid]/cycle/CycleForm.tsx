"use client";
import { useActionState, useState } from "react";
import type { Dict } from "@/i18n";
import { fill } from "@/i18n";
import type { ActionResult } from "@/lib/actions";

export type Hand = { member_id: string; name: string; hand_no: number; hands: number };

export function CycleForm({ t, hands, firstDate, action, initialMethod = "draw", submitDraw }: {
  t: Pick<Dict, "cycle" | "errors">;
  hands: Hand[];
  firstDate: string;
  action: (prev: ActionResult, f: FormData) => Promise<ActionResult>;
  initialMethod?: "draw" | "manual";
  submitDraw?: string;
}) {
  const [state, run, pending] = useActionState<ActionResult, FormData>(action, null);
  const [method, setMethod] = useState<"draw" | "manual">(initialMethod);
  const [order, setOrder] = useState(hands);
  const c = t.cycle;
  const move = (i: number, d: -1 | 1) =>
    setOrder((o) => {
      const j = i + d;
      if (j < 0 || j >= o.length) return o;
      const n = [...o];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  return (
    <form action={run} className="stack">
      {state?.error && <p className="error" role="alert">{t.errors[state.error]}</p>}
      <div className="field">
        <label htmlFor="first_date">{c.firstDate}</label>
        <input id="first_date" name="first_date" type="date" className="input" required defaultValue={firstDate} />
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 4 }}>{c.method}</legend>
        <div className="segmented">
          {(["draw", "manual"] as const).map((v) => (
            <label key={v}>
              <input type="radio" name="method" value={v} checked={method === v} onChange={() => setMethod(v)} />
              <span>{c[v]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {method === "draw" ? (
        <div className="field">
          <label htmlFor="witness">{c.witness}</label>
          <span className="hint">{c.witnessHint}</span>
          <input id="witness" name="witness" className="input" maxLength={500} />
        </div>
      ) : (
        <>
          <input type="hidden" name="order" value={JSON.stringify(order.map(({ member_id, hand_no }) => ({ member_id, hand_no })))} />
          <ol className="list" style={{ paddingLeft: 0 }}>
            {order.map((h, i) => (
              <li key={`${h.member_id}-${h.hand_no}`} className="row">
                <span className="num" style={{ width: 28 }}>{i + 1}</span>
                <span className="row-main">
                  <span className="row-title">{h.name}</span>
                  {h.hands > 1 && <span className="row-sub">{fill(c.handNo, { n: h.hand_no })}</span>}
                </span>
                <button type="button" className="seg" aria-label={`${c.moveUp}: ${h.name}`} onClick={() => move(i, -1)} disabled={i === 0} style={{ width: 44 }}>↑</button>
                <button type="button" className="seg" aria-label={`${c.moveDown}: ${h.name}`} onClick={() => move(i, 1)} disabled={i === order.length - 1} style={{ width: 44 }}>↓</button>
              </li>
            ))}
          </ol>
        </>
      )}
      <button className="btn btn-block" disabled={pending || hands.length === 0}>
        {method === "draw" ? (submitDraw ?? c.runDraw) : c.saveOrder}
      </button>
    </form>
  );
}
