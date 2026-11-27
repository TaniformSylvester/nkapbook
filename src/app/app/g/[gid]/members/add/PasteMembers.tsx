"use client";
import { useActionState, useMemo, useState } from "react";
import { fill, type Dict } from "@/i18n";
import type { ActionResult } from "@/lib/actions";
import { parseMemberList } from "@/lib/parse-members";
import { formatCmPhone } from "@/lib/phone";

type Props = {
  t: Pick<Dict, "paste" | "errors" | "members">;
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
};

export function PasteMembers({ t, action }: Props) {
  const [text, setText] = useState("");
  const [state, run, pending] = useActionState<ActionResult, FormData>(action, null);
  const parsed = useMemo(() => parseMemberList(text), [text]);
  const good = parsed.filter((p) => p.ok);
  const bad = parsed.filter((p) => !p.ok);
  const p = t.paste;

  return (
    <form action={run} className="stack">
      {state?.error && <p className="error" role="alert">{t.errors[state.error]}</p>}
      <div className="field">
        <label htmlFor="list">{p.label}</label>
        <span className="hint" id="list-hint">{p.lead}</span>
        <textarea
          id="list"
          name="list"
          className="input"
          aria-describedby="list-hint"
          placeholder={p.example}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </div>
      {parsed.length > 0 && (
        <div className="card stack" aria-live="polite">
          <h3>{p.preview}</h3>
          <p className="small">
            <strong>{fill(p.ok, { n: good.length })}</strong>
            {bad.length > 0 && <> · <span style={{ color: "var(--danger)" }}>{fill(p.problems, { n: bad.length })}</span></>}
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {parsed.map((r) =>
              r.ok ? (
                <li key={r.line} className="preview-line">
                  {r.name} · {r.phone ? formatCmPhone(r.phone) : t.members.noPhone} · {r.hands === 1 ? t.members.hand : fill(t.members.hands, { n: r.hands })}
                </li>
              ) : (
                <li key={r.line} className="preview-line bad">
                  {fill(p.lineError, { line: r.line, problem: p[r.problem] })}: “{r.raw}”
                </li>
              ),
            )}
          </ul>
        </div>
      )}
      <button className="btn btn-block" disabled={pending || good.length === 0}>
        {fill(p.submit, { n: good.length })}
      </button>
    </form>
  );
}
