import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { AppHeader } from "@/components/AppHeader";
import { fill } from "@/i18n";
import { getGroupContext } from "@/lib/group";
import { formatMoney } from "@/lib/money";
import { canOpenMeetings, subscriptionState } from "@/lib/subscription";
import { todayDouala } from "../Subscription";
import { openMeeting } from "./actions";

type Row = { id: string; date: string; status: "planned" | "open" | "closed" };
type Sum = { meeting_id: string; kind: string; amount: number; reverses_entry_id: string | null };

export default async function MeetingsPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { sb, group, lang, t } = await getGroupContext(gid);
  const [{ data: meetings }, { data: cycle }, { data: entries }, { data: nextSlot }] = await Promise.all([
    sb.from("meetings").select("id, date, status").eq("group_id", gid).order("date", { ascending: false }).limit(60).returns<Row[]>(),
    sb.from("cycles").select("id, status").eq("group_id", gid).in("status", ["active"]).maybeSingle(),
    sb.from("ledger_entries").select("meeting_id, kind, amount, reverses_entry_id").eq("group_id", gid)
      .in("kind", ["contribution_due", "contribution_paid"]).not("meeting_id", "is", null).returns<Sum[]>(),
    sb.from("cycle_slots").select("planned_date").eq("group_id", gid).is("meeting_id", null).order("position").limit(1).maybeSingle(),
  ]);
  const totals = new Map<string, { due: number; paid: number }>();
  for (const e of entries ?? []) {
    const x = totals.get(e.meeting_id) ?? { due: 0, paid: 0 };
    const v = e.reverses_entry_id ? -e.amount : e.amount;
    if (e.kind === "contribution_due") x.due += v;
    else x.paid += v;
    totals.set(e.meeting_id, x);
  }
  const today = new Date().toISOString().slice(0, 10);
  const openOne = (meetings ?? []).find((m) => m.status === "open");
  const status = { open: t.meetings.statusOpen, closed: t.meetings.statusClosed, planned: t.meetings.statusPlanned };
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(lang === "fr" ? "fr-CM" : "en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <>
      <AppHeader lang={lang} t={t} back={`/app/g/${gid}`} title={t.meetings.title} sub={group.name} />
      <main className="wrap stack">
        {openOne && (
          <Link className="btn btn-block" href={`/app/g/${gid}/meetings/${openOne.id}`}>{t.meetings.continue}</Link>
        )}
        {!cycle && <p className="note">{t.meetings.noCycle} <Link href={`/app/g/${gid}/cycle`}>{t.cycle.title} →</Link></p>}
        {!canOpenMeetings(subscriptionState(group, todayDouala())) ? (
          <div className="card stack" role="status">
            <h2 style={{ margin: 0 }}>{t.meetings.open}</h2>
            <p style={{ margin: 0 }}>{t.errors.subscriptionEnded}</p>
            <Link className="btn btn-block" href={`/app/g/${gid}/settings#subscription`}>{t.sub.renew}</Link>
          </div>
        ) : (
        <ActionForm action={openMeeting.bind(null, gid)} errors={t.errors} submit={t.meetings.openBtn} className="card stack">
          <h2 style={{ margin: 0 }}>{t.meetings.open}</h2>
          <p className="small muted">{t.meetings.openHint}</p>
          <div className="field">
            <label htmlFor="date">{t.meetings.date}</label>
            <input id="date" name="date" type="date" className="input" required defaultValue={(nextSlot?.planned_date as string | undefined) ?? today} />
          </div>
        </ActionForm>
        )}
        <div className="actions">
          <Link href={`/app/g/${gid}/reminders`} className="btn btn-ghost">{t.remind.open}</Link>
          <Link href={`/app/g/${gid}/cycle`} className="btn btn-ghost">{t.cycle.title}</Link>
        </div>
        {(meetings ?? []).length === 0 ? (
          <p className="muted">{t.meetings.none}</p>
        ) : (
          <ul className="list">
            {(meetings ?? []).map((m) => {
              const x = totals.get(m.id) ?? { due: 0, paid: 0 };
              return (
                <li key={m.id}>
                  <Link className="row" href={`/app/g/${gid}/meetings/${m.id}`}>
                    <div className="row-main">
                      <div className="row-title">{fmt(m.date)}</div>
                      <div className="row-sub">{fill(t.meetings.collected, { paid: formatMoney(x.paid, lang, group.currency), expected: formatMoney(x.due, lang, group.currency) })}</div>
                    </div>
                    <span className={`chip${m.status === "closed" ? " chip-muted" : ""}`}>{status[m.status]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
