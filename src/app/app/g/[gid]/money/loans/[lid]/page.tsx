import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { AppHeader } from "@/components/AppHeader";
import { AmountField, MemberSelect, MethodSelect, OpId } from "@/components/Fields";
import { fill } from "@/i18n";
import { fmtDate } from "@/lib/dates";
import { getGroupContext } from "@/lib/group";
import { currencyLabel, formatMoney } from "@/lib/money";
import { addGuarantor, loanEntry, removeGuarantor } from "../../actions";
import type { LoanRow } from "../page";

export default async function LoanPage({ params }: { params: Promise<{ gid: string; lid: string }> }) {
  const { gid, lid } = await params;
  const { sb, group, lang, t } = await getGroupContext(gid);
  if (!/^[0-9a-f-]{36}$/i.test(lid)) notFound();
  const { data: l } = await sb.from("loan_balances").select("*").eq("id", lid).eq("group_id", gid).maybeSingle<LoanRow>();
  if (!l) notFound();
  const [{ data: entries }, { data: guarantors }, { data: members }] = await Promise.all([
    sb.from("ledger_entries").select("id, kind, amount, method, note, reason, recorded_at, reverses_entry_id").eq("loan_id", lid).order("recorded_at"),
    sb.from("loan_guarantors").select("member_id, members(name)").eq("loan_id", lid),
    sb.from("members").select("id, name").eq("group_id", gid).eq("status", "active").order("name"),
  ]);
  const f = (n: number) => formatMoney(n, lang, group.currency);
  const L = t.loans;
  const gIds = new Set((guarantors ?? []).map((g) => g.member_id as string));
  const candidates = (members ?? []).filter((m) => m.id !== l.member_id && !gIds.has(m.id));
  type G = { member_id: string; members: { name: string } | null };

  return (
    <>
      <AppHeader lang={lang} t={t} back={`/app/g/${gid}/money/loans`} title={l.member_name}
        sub={`${f(l.principal)} · ${l.interest_rate_pct}${l.interest_basis === "per_month" ? L.perMonth : L.flat}`} />
      <main className="wrap stack">
        <div className="grid2">
          <div className={`stat${l.overdue ? " stat-owe" : ""}`}>
            <div className="label">{L.balance}</div>
            <div className="value">{f(l.balance)}</div>
            {l.overdue && <span className="chip chip-danger">{L.overdue}</span>}
          </div>
          <div className="stat">
            <div className="label">{L.due}</div>
            <div className="value" style={{ fontSize: "1rem" }}>{fmtDate(lang, l.due_date)}</div>
            <div className="small muted">{fill(L.summary, { months: l.term_months, interest: f(l.interest), total: f(l.owed_total) })}</div>
          </div>
        </div>

        {l.balance > 0 && (
          <section className="card stack">
            <h2 style={{ margin: 0 }}>{L.repay}</h2>
            <ActionForm action={loanEntry.bind(null, gid, lid, "loan_repayment")} errors={t.errors} submit={L.repay} okText={t.money.saved}>
              <OpId />
              <div className="grid2">
                <AmountField label={fill(t.money.amount, { cur: currencyLabel(group.currency) })} defaultValue={l.balance} />
                <MethodSelect t={t} />
              </div>
            </ActionForm>
          </section>
        )}

        <section className="stack">
          <h2>{L.guarantors}</h2>
          <ul className="list">
            {((guarantors ?? []) as unknown as G[]).map((g) => (
              <li key={g.member_id} className="row">
                <span className="row-main">{g.members?.name}</span>
                {l.status === "active" && (
                  <form action={removeGuarantor.bind(null, gid, lid, g.member_id)}><button className="btn-link">{L.remove}</button></form>
                )}
              </li>
            ))}
          </ul>
          {l.status === "active" && candidates.length > 0 && (
            <form action={addGuarantor.bind(null, gid, lid)} className="stack">
              <MemberSelect members={candidates} label={L.addGuarantor} id="guarantor" />
              <button className="btn btn-ghost btn-block">{L.addGuarantor}</button>
            </form>
          )}
        </section>

        <section className="stack">
          <h2>{L.history}</h2>
          <ul className="list">
            {(entries ?? []).map((e) => (
              <li key={e.id as string} className="row hist">
                <span className="row-main">
                  <span className="row-title">{e.reverses_entry_id ? `${t.me.correction}: ` : ""}{t.me.kinds[e.kind as keyof typeof t.me.kinds]}</span>
                  <span className="row-sub">{fmtDate(lang, e.recorded_at as string)}{e.method ? ` · ${t.methods[e.method as keyof typeof t.methods]}` : ""}{(e.reason || e.note) ? ` · ${e.reason ?? e.note}` : ""}</span>
                </span>
                <span className={`num${e.kind === "loan_repaid" ? " in" : ""}`}>{e.reverses_entry_id ? "−" : ""}{f(e.amount as number)}</span>
              </li>
            ))}
          </ul>
        </section>

        {l.status === "active" && (
          <details className="card">
            <summary className="btn-link">{L.addInterest}</summary>
            <ActionForm action={loanEntry.bind(null, gid, lid, "loan_interest")} errors={t.errors} submit={L.addInterest} okText={t.money.saved}>
              <OpId />
              <p className="small muted">{L.addInterestHint}</p>
              <AmountField label={fill(t.money.amount, { cur: currencyLabel(group.currency) })} id="interest_amount" />
              <div className="field">
                <label htmlFor="reason">{t.money.reason}</label>
                <input id="reason" name="reason" className="input" required minLength={3} maxLength={500} />
              </div>
            </ActionForm>
          </details>
        )}
      </main>
    </>
  );
}
