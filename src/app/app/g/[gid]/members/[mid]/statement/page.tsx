import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PrintButton } from "@/components/PrintButton";
import { fill } from "@/i18n";
import { fmtDate } from "@/lib/dates";
import { getGroupContext } from "@/lib/group";
import { formatFcfa } from "@/lib/money";
import { formatCmPhone } from "@/lib/phone";

const IN = ["contribution_paid", "fine_paid", "loan_repaid", "event_paid", "fund_deposit"];

export default async function Statement({ params }: { params: Promise<{ gid: string; mid: string }> }) {
  const { gid, mid } = await params;
  const { sb, group, lang, t } = await getGroupContext(gid);
  if (!/^[0-9a-f-]{36}$/i.test(mid)) notFound();
  const { data: b } = await sb.from("member_balances").select("*").eq("member_id", mid).eq("group_id", gid).maybeSingle();
  if (!b) notFound();
  const [{ data: entries }, { data: meetings }, { data: slots }] = await Promise.all([
    sb.from("ledger_entries").select("id, kind, amount, method, momo_ref, meeting_id, recorded_at, reverses_entry_id, reason").eq("member_id", mid).order("recorded_at"),
    sb.from("meetings").select("id, date").eq("group_id", gid),
    sb.from("cycle_slots").select("planned_date, hand_no, meeting_id, cycles!inner(status)").eq("member_id", mid).in("cycles.status", ["active", "draft"]).order("position"),
  ]);
  const mdate = new Map((meetings ?? []).map((m) => [m.id as string, m.date as string]));
  const f = (n: number) => formatFcfa(n, lang);
  const X = t.exports;
  const K = t.me.kinds;
  const owing = Math.max(0, Number(b.contribution_owing)) + Math.max(0, Number(b.fines_owing)) + Math.max(0, Number(b.events_owing));

  return (
    <main className="wrap print-doc stack">
      <PrintButton label={X.print} />
      <header className="print-head">
        <Logo />
        <div>
          <h1 style={{ margin: 0 }}>{b.name as string}</h1>
          <p style={{ margin: 0 }}>{X.statement} · {group.name}{b.phone ? ` · ${formatCmPhone(b.phone as string)}` : ""}</p>
        </div>
      </header>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={X.totals}><table className="print-table">
        <tbody>
          <tr><th>{t.me.paid}</th><td className="r">{f(Number(b.contributions_paid))}</td></tr>
          <tr><th>{t.me.owing}</th><td className="r">{f(owing)}</td></tr>
          {Number(b.fines_owing) > 0 && <tr><th>{t.me.fines}</th><td className="r">{f(Number(b.fines_owing))}</td></tr>}
          {Number(b.loans_owing) > 0 && <tr><th>{t.me.loans}</th><td className="r">{f(Number(b.loans_owing))}</td></tr>}
          {Number(b.savings) > 0 && <tr><th>{t.money.fund}</th><td className="r">{f(Number(b.savings))}</td></tr>}
        </tbody>
      </table></div>
      {(slots ?? []).length > 0 && (
        <p><strong>{t.me.yourTurn}:</strong> {(slots ?? []).map((s) => `${fmtDate(lang, s.planned_date as string)}${s.meeting_id ? " ✓" : ""}`).join(", ")}</p>
      )}
      <h2>{t.me.history}</h2>
      <div className="table-scroll" tabIndex={0} role="region" aria-label={X.totals}><table className="print-table">
        <thead><tr><th>{t.meetings.date}</th><th>{X.details}</th><th className="r">FCFA</th></tr></thead>
        <tbody>
          {(entries ?? []).map((e) => (
            <tr key={e.id as string} className={e.reverses_entry_id ? "corr" : ""}>
              <td>{fmtDate(lang, (e.meeting_id && mdate.get(e.meeting_id as string)) || (e.recorded_at as string), { day: "numeric", month: "short", year: "numeric" })}</td>
              <td>
                {e.reverses_entry_id ? `${t.me.correction}: ` : ""}{K[e.kind as keyof typeof K]}
                {e.method ? ` · ${t.methods[e.method as keyof typeof t.methods]}` : ""}{e.momo_ref ? ` ${e.momo_ref}` : ""}
                {e.reason ? ` · “${e.reason}”` : ""}
              </td>
              <td className="r">{e.reverses_entry_id ? "−" : IN.includes(e.kind as string) ? "+" : ""}{f(e.amount as number)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="small muted">{fill(X.generated, { date: fmtDate(lang, new Date().toISOString(), { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}</p>
    </main>
  );
}
