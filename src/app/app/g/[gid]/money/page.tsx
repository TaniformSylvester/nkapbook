import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { AppHeader } from "@/components/AppHeader";
import { AmountField, MemberSelect, MethodSelect, OpId } from "@/components/Fields";
import { fill } from "@/i18n";
import { fmtDate } from "@/lib/dates";
import { getGroupContext } from "@/lib/group";
import { currencyLabel, formatMoney } from "@/lib/money";
import { recordFund } from "./actions";

export default async function MoneyPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { sb, group, lang, t } = await getGroupContext(gid);
  const [{ data: acc }, { data: fines }, { data: loans }, { count: events }, { data: members }, { data: moves }] = await Promise.all([
    sb.from("group_accounts").select("*").eq("group_id", gid).maybeSingle(),
    sb.from("fine_balances").select("balance").eq("group_id", gid).gt("balance", 0),
    sb.from("loan_balances").select("balance, overdue, status").eq("group_id", gid).eq("status", "active"),
    sb.from("social_events").select("id", { count: "exact", head: true }).eq("group_id", gid),
    sb.from("members").select("id, name").eq("group_id", gid).eq("status", "active").order("name"),
    sb.from("ledger_net").select("id, kind, net, recorded_at, note, member_id").eq("group_id", gid).eq("account", "fund")
      .in("kind", ["fund_deposit", "fund_withdrawal", "loan_disbursed", "loan_repaid", "fine_paid"]).order("recorded_at", { ascending: false }).limit(15),
  ]);
  const f = (n: number) => formatMoney(n, lang, group.currency);
  const fineTotal = (fines ?? []).reduce((s, x) => s + Number(x.balance), 0);
  const loanTotal = (loans ?? []).reduce((s, x) => s + Number(x.balance), 0);
  const overdue = (loans ?? []).filter((x) => x.overdue).length;
  type Move = { id: string; kind: keyof typeof t.me.kinds; net: number; recorded_at: string; note: string | null; member_id: string | null };
  const nameOf = new Map((members ?? []).map((x) => [x.id as string, x.name as string]));

  return (
    <>
      <AppHeader lang={lang} t={t} back={`/app/g/${gid}`} title={t.money.title} sub={group.name} />
      <main className="wrap stack">
        <div className="grid2">
          <div className="stat">
            <div className="label">{t.money.fund}</div>
            <div className="value">{f(Number(acc?.fund_balance ?? 0))}</div>
          </div>
          <div className="stat">
            <div className="label">{t.money.social}</div>
            <div className="value">{f(Number(acc?.social_balance ?? 0))}</div>
          </div>
        </div>
        <p className="small muted">{t.money.fundHint}</p>
        <ul className="list">
          <li><Link className="row" href={`/app/g/${gid}/money/fines`}>
            <span className="row-main"><span className="row-title">{t.money.fines}</span><span className="row-sub">{fill(t.money.unpaidFines, { amount: f(fineTotal) })}</span></span><span aria-hidden="true">›</span>
          </Link></li>
          <li><Link className="row" href={`/app/g/${gid}/money/loans`}>
            <span className="row-main"><span className="row-title">{t.money.loans}</span>
              <span className="row-sub">{fill(t.money.activeLoans, { n: loans?.length ?? 0, amount: f(loanTotal) })}{overdue > 0 && <span className="mm-owe"> · {fill(t.money.overdueLoans, { n: overdue })}</span>}</span>
            </span><span aria-hidden="true">›</span>
          </Link></li>
          <li><Link className="row" href={`/app/g/${gid}/money/events`}>
            <span className="row-main"><span className="row-title">{t.money.events}</span><span className="row-sub">{fill(t.money.openEvents, { n: events ?? 0 })}</span></span><span aria-hidden="true">›</span>
          </Link></li>
        </ul>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>{t.money.movement}</h2>
          <ActionForm action={recordFund.bind(null, gid)} errors={t.errors} submit={t.money.record} okText={t.money.saved}>
            <OpId />
            <div className="segmented">
              <label><input type="radio" name="kind" value="fund_deposit" defaultChecked /><span>{t.money.deposit}</span></label>
              <label><input type="radio" name="kind" value="fund_withdrawal" /><span>{t.money.withdrawal}</span></label>
            </div>
            <MemberSelect members={members ?? []} label={t.money.who} optional={t.money.nobody} />
            <div className="grid2">
              <AmountField label={fill(t.money.amount, { cur: currencyLabel(group.currency) })} />
              <MethodSelect t={t} />
            </div>
            <div className="field">
              <label htmlFor="note">{t.money.note}</label>
              <input id="note" name="note" className="input" maxLength={500} />
            </div>
          </ActionForm>
        </section>

        {(moves ?? []).length > 0 && (
          <section className="stack">
            <h2>{t.money.recent}</h2>
            <ul className="list">
              {(moves as unknown as Move[]).map((x) => {
                const out = x.kind === "loan_disbursed" || x.kind === "fund_withdrawal";
                return (
                  <li key={x.id} className="row hist">
                    <span className="row-main">
                      <span className="row-title">{t.me.kinds[x.kind]}{x.member_id && nameOf.get(x.member_id) ? ` · ${nameOf.get(x.member_id)}` : ""}</span>
                      <span className="row-sub">{fmtDate(lang, x.recorded_at)}{x.note ? ` · ${x.note}` : ""}</span>
                    </span>
                    <span className={`num${out ? "" : " in"}`}>{out ? "−" : "+"}{f(Math.abs(Number(x.net)))}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
