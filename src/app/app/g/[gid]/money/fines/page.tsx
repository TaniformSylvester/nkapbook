import { randomUUID } from "node:crypto";
import { ActionForm } from "@/components/ActionForm";
import { AppHeader } from "@/components/AppHeader";
import { AmountField, MemberSelect, OpId } from "@/components/Fields";
import { fill } from "@/i18n";
import { fmtDate } from "@/lib/dates";
import { getGroupContext } from "@/lib/group";
import { currencyLabel, formatMoney } from "@/lib/money";
import { addFine, addRule, applyRules, payFine, reverseEntry, toggleRule } from "../actions";
import { ApplyRules } from "../ApplyRules";

type Fine = { id: string; member_name: string; type: keyof Dict["fines"]["types"]; note: string | null; created_at: string; charged: number; paid: number; balance: number; charge_entry_id: string | null };
type Dict = import("@/i18n").Dict;
const TYPES = ["late_payment", "absence", "lateness", "misconduct", "custom"] as const;

export default async function FinesPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { sb, group, lang, t } = await getGroupContext(gid);
  const [{ data: fines }, { data: rules }, { data: members }, { data: meetings }] = await Promise.all([
    sb.from("fine_balances").select("*").eq("group_id", gid).order("created_at", { ascending: false }).limit(200).returns<Fine[]>(),
    sb.from("fine_rules").select("*").eq("group_id", gid).order("created_at"),
    sb.from("members").select("id, name").eq("group_id", gid).eq("status", "active").order("name"),
    sb.from("meetings").select("id, date").eq("group_id", gid).order("date", { ascending: false }).limit(5),
  ]);
  const f = (n: number) => formatMoney(n, lang, group.currency);
  const unpaid = (fines ?? []).filter((x) => x.balance > 0);
  const settled = (fines ?? []).filter((x) => x.balance <= 0);
  const ft = t.fines;

  return (
    <>
      <AppHeader lang={lang} t={t} back={`/app/g/${gid}/money`} title={ft.title} sub={group.name} />
      <main className="wrap stack">
        <section className="stack">
          <h2>{ft.unpaid}</h2>
          {unpaid.length === 0 ? <p className="muted">{ft.none}</p> : (
            <ul className="list">
              {unpaid.map((x) => (
                <li key={x.id} className="mm-row">
                  <div className="mm-line">
                    <span className="mm-name" style={{ cursor: "default" }}>
                      <span className="row-title">{x.member_name}</span>
                      <span className="row-sub">{ft.types[x.type]} · {fmtDate(lang, x.created_at, { day: "numeric", month: "short" })}{x.note ? ` · ${x.note}` : ""}</span>
                    </span>
                    <form action={payFine.bind(null, gid, x.id, x.balance, randomUUID())}>
                      <button className="btn mm-pay">{fill(ft.pay, { amount: f(x.balance) })}</button>
                    </form>
                  </div>
                  {x.charge_entry_id && x.paid === 0 && (
                    <details className="mm-panel">
                      <summary className="btn-link">{ft.waive}</summary>
                      <ActionForm action={reverseEntry.bind(null, gid, x.charge_entry_id)} errors={t.errors} submit={ft.waive}>
                        <OpId />
                        <div className="field">
                          <label htmlFor={`why-${x.id}`}>{ft.waiveReason}</label>
                          <input id={`why-${x.id}`} name="reason" className="input" required minLength={3} maxLength={500} />
                        </div>
                      </ActionForm>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {(meetings ?? []).length > 0 && (
          <section className="card stack">
            <h2 style={{ margin: 0 }}>{ft.apply}</h2>
            {(meetings ?? []).slice(0, 3).map((mt) => (
              <div key={mt.id}>
                <p className="small" style={{ margin: 0 }}><strong>{fmtDate(lang, mt.date as string)}</strong></p>
                <ApplyRules action={applyRules.bind(null, gid, mt.id as string)} label={ft.apply} hint="" done={ft.applied} />
              </div>
            ))}
            <p className="small muted">{ft.applyHint}</p>
          </section>
        )}

        <section className="card stack">
          <h2 style={{ margin: 0 }}>{ft.add}</h2>
          <ActionForm action={addFine.bind(null, gid)} errors={t.errors} submit={ft.add} okText={t.money.saved}>
            <OpId />
            <MemberSelect members={members ?? []} label={t.money.member} />
            <div className="field">
              <label htmlFor="fine_type">{ft.type}</label>
              <select id="fine_type" name="fine_type" className="input" defaultValue="misconduct">
                {TYPES.map((k) => <option key={k} value={k}>{ft.types[k]}</option>)}
              </select>
            </div>
            <AmountField label={fill(t.money.amount, { cur: currencyLabel(group.currency) })} />
            <div className="field">
              <label htmlFor="note">{t.money.note}</label>
              <input id="note" name="note" className="input" maxLength={500} />
            </div>
          </ActionForm>
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>{ft.rules}</h2>
          <p className="small muted">{ft.rulesLead}</p>
          {(rules ?? []).length > 0 && (
            <ul className="list">
              {(rules ?? []).map((r) => (
                <li key={r.id} className="row">
                  <span className="row-main">
                    <span className="row-title">{ft.types[r.type as (typeof TYPES)[number]]}</span>
                    <span className="row-sub">{f(r.amount as number)}</span>
                  </span>
                  <form action={toggleRule.bind(null, gid, r.id as string, !r.active)}>
                    <button className={`seg${r.active ? " on" : ""}`} style={{ minWidth: 72 }}>{r.active ? ft.ruleOn : ft.ruleOff}</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={addRule.bind(null, gid)} errors={t.errors} submit={ft.addRule}>
            <div className="grid2">
              <div className="field">
                <label htmlFor="rule_type">{ft.type}</label>
                <select id="rule_type" name="fine_type" className="input" defaultValue="late_payment">
                  {(["late_payment", "absence", "lateness"] as const).map((k) => <option key={k} value={k}>{ft.types[k]}</option>)}
                </select>
              </div>
              <AmountField label={fill(t.money.amount, { cur: currencyLabel(group.currency) })} id="rule_amount" />
            </div>
          </ActionForm>
        </section>

        {settled.length > 0 && (
          <details>
            <summary className="btn-link">{ft.history} ({settled.length})</summary>
            <ul className="list">
              {settled.map((x) => (
                <li key={x.id} className="row hist">
                  <span className="row-main">
                    <span className="row-title">{x.member_name} · {ft.types[x.type]}</span>
                    <span className="row-sub">{fmtDate(lang, x.created_at, { day: "numeric", month: "short", year: "numeric" })} · {x.charged === 0 ? ft.waived : ft.paid}</span>
                  </span>
                  <span className="num">{f(x.charged || x.paid)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
    </>
  );
}
