import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { PrintButton } from "@/components/PrintButton";
import { fill } from "@/i18n";
import { fmtDate } from "@/lib/dates";
import { getGroupContext } from "@/lib/group";
import { formatFcfa } from "@/lib/money";
import type { Snapshot } from "@/lib/offline/types";

export default async function PrintMeeting({ params }: { params: Promise<{ gid: string; mid: string }> }) {
  const { gid, mid } = await params;
  const { sb, group, lang, t } = await getGroupContext(gid);
  if (!/^[0-9a-f-]{36}$/i.test(mid)) notFound();
  const { data } = await sb.rpc("meeting_snapshot", { p_meeting: mid });
  const s = data as Snapshot | null;
  if (!s || s.meeting.group_id !== gid) notFound();
  const [{ data: fines }, { data: officials }] = await Promise.all([
    sb.from("fine_balances").select("member_name, type, charged").eq("meeting_id", mid),
    sb.from("members").select("name, role").eq("group_id", gid).neq("role", "member").eq("status", "active"),
  ]);
  const f = (n: number) => formatFcfa(n, lang);
  const X = t.exports;
  const due = s.members.reduce((a, m) => a + m.due_today, 0);
  const paid = s.members.reduce((a, m) => a + m.paid_today, 0);

  return (
    <main className="wrap print-doc stack">
      <PrintButton label={X.print} />
      <header className="print-head">
        <Logo />
        <div>
          <h1 style={{ margin: 0 }}>{group.name}</h1>
          <p style={{ margin: 0 }}>{X.meetingSummary} · {fmtDate(lang, s.meeting.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
      </header>
      {s.collectors.length > 0 && (
        <p><strong>{t.live.collectsToday}:</strong> {s.collectors.map((c) => {
          const p = c.payouts.find((x) => !x.reversed);
          return `${c.name}${p ? ` (${fill(t.live.payoutDone, { amount: f(p.amount), method: t.methods[p.method] })}${p.confirmed ? ` ✓ ${fill(t.live.confirmed, { name: c.name })}` : ""})` : ""}`;
        }).join("; ")}</p>
      )}
      <div className="table-scroll"><table className="print-table">
        <thead><tr><th>{X.member}</th><th>{X.present}</th><th className="r">{X.due}</th><th className="r">{X.paidCol}</th><th className="r">{X.balance}</th></tr></thead>
        <tbody>
          {s.members.map((m) => (
            <tr key={m.id}>
              <td>{m.name}{m.hands > 1 ? ` (${m.hands})` : ""}{m.payments.filter((p) => !p.reversed).map((p) => p.method !== "cash" ? ` · ${t.methods[p.method]}${p.momo_ref ? ` ${p.momo_ref}` : ""}` : "").join("")}</td>
              <td>{m.attendance ? t.attendance[m.attendance] : "—"}</td>
              <td className="r">{f(m.due_today)}</td>
              <td className="r">{f(m.paid_today)}</td>
              <td className="r">{f(Math.max(0, m.owing_before + m.due_today - m.paid_today))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><th>{X.totals}</th><th /><th className="r">{f(due)}</th><th className="r">{f(paid)}</th><th /></tr></tfoot>
      </table></div>
      {(fines ?? []).length > 0 && (
        <section>
          <h2>{t.fines.title}</h2>
          <ul>{(fines ?? []).map((x, i) => <li key={i}>{x.member_name as string}: {t.fines.types[x.type as keyof typeof t.fines.types]} · {f(Number(x.charged))}</li>)}</ul>
        </section>
      )}
      {s.meeting.minutes && (<section><h2>{t.live.minutes}</h2><p style={{ whiteSpace: "pre-wrap" }}>{s.meeting.minutes}</p></section>)}
      <section>
        <h2>{X.signatures}</h2>
        <div className="sigs">{(officials ?? []).map((o, i) => <div key={i}><span>{o.name as string}</span><small>{t.roles[o.role as keyof typeof t.roles]}</small></div>)}</div>
      </section>
      <p className="small muted">{fill(X.generated, { date: fmtDate(lang, new Date().toISOString(), { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) })}</p>
    </main>
  );
}
