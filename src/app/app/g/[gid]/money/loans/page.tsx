import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { fill } from "@/i18n";
import { fmtDate } from "@/lib/dates";
import { getGroupContext } from "@/lib/group";
import { formatMoney } from "@/lib/money";
import { giveLoan } from "../actions";
import { LoanForm } from "./LoanForm";

export type LoanRow = {
  id: string; member_id: string; member_name: string; principal: number; interest_rate_pct: number; interest_basis: "per_month" | "flat";
  term_months: number; start_date: string; due_date: string; status: "active" | "repaid" | "defaulted"; note: string | null;
  owed_total: number; interest: number; repaid: number; balance: number; overdue: boolean;
};

export default async function LoansPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { sb, group, lang, t } = await getGroupContext(gid);
  const [{ data: loans }, { data: members }, { data: acc }] = await Promise.all([
    sb.from("loan_balances").select("*").eq("group_id", gid).order("status").order("due_date").returns<LoanRow[]>(),
    sb.from("members").select("id, name").eq("group_id", gid).eq("status", "active").order("name"),
    sb.from("group_accounts").select("fund_balance").eq("group_id", gid).maybeSingle(),
  ]);
  const f = (n: number) => formatMoney(n, lang, group.currency);
  const L = t.loans;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Douala" });

  return (
    <>
      <AppHeader lang={lang} t={t} back={`/app/g/${gid}/money`} title={L.title} sub={`${group.name} · ${t.money.fund}: ${f(Number(acc?.fund_balance ?? 0))}`} />
      <main className="wrap stack">
        {(loans ?? []).length === 0 ? <p className="muted">{L.none}</p> : (
          <ul className="list">
            {(loans ?? []).map((l) => (
              <li key={l.id}>
                <Link className="row" href={`/app/g/${gid}/money/loans/${l.id}`}>
                  <span className="row-main">
                    <span className="row-title">{l.member_name}</span>
                    <span className="row-sub">{fill(L.dueOn, { date: fmtDate(lang, l.due_date, { day: "numeric", month: "short", year: "numeric" }) })}</span>
                  </span>
                  <span className="row-end">
                    <span className="num" style={{ display: "block", fontWeight: 700 }}>{f(l.balance)}</span>
                    <span className={`chip${l.overdue ? " chip-danger" : l.status === "repaid" ? " chip-muted" : ""}`}>
                      {l.overdue ? L.overdue : l.status === "repaid" ? L.repaid : L.active}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <section className="card stack">
          <h2 style={{ margin: 0 }}>{L.new}</h2>
          <LoanForm
            t={{ loans: t.loans, money: t.money, methods: t.methods, errors: t.errors }}
            lang={lang}
            currency={group.currency}
            members={members ?? []}
            fund={Number(acc?.fund_balance ?? 0)}
            action={giveLoan.bind(null, gid)}
            opId={randomUUID()}
            today={today}
          />
        </section>
      </main>
    </>
  );
}
