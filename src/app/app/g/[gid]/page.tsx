import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { fill } from "@/i18n";
import { fmtDate } from "@/lib/dates";
import { getGroupContext, scheduleText } from "@/lib/group";
import { formatFcfa } from "@/lib/money";
import { SubscriptionNotice } from "./Subscription";

type Bal = { member_id: string; name: string; contribution_owing: number; fines_owing: number; loans_owing: number; events_owing: number };
type Slot = { planned_date: string; hand_no: number; members: { name: string; hands: number } | null };

export default async function GroupOverview({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { sb, group, me, lang, t } = await getGroupContext(gid);
  const [{ data: members }, { data: openMeeting }, { data: slots }, { data: bal }, { data: acc }, { data: overdue }] = await Promise.all([
    sb.from("members").select("hands").eq("group_id", gid).eq("status", "active"),
    sb.from("meetings").select("id").eq("group_id", gid).eq("status", "open").order("date", { ascending: false }).limit(1).maybeSingle(),
    sb.from("cycle_slots").select("planned_date, hand_no, members(name, hands), cycles!inner(status)").eq("group_id", gid)
      .eq("cycles.status", "active").is("meeting_id", null).order("position").limit(Math.max(3, group.collectors_per_meeting)),
    sb.from("member_balances").select("member_id, name, contribution_owing, fines_owing, loans_owing, events_owing").eq("group_id", gid).eq("status", "active"),
    sb.from("group_accounts").select("fund_balance").eq("group_id", gid).maybeSingle(),
    sb.from("loan_balances").select("id").eq("group_id", gid).eq("overdue", true),
  ]);
  const f = (n: number) => formatFcfa(n, lang);
  const count = members?.length ?? 0;
  const hands = (members ?? []).reduce((s, m) => s + (m.hands as number), 0);
  const next = (slots ?? []) as unknown as Slot[];
  const owing = ((bal ?? []) as Bal[])
    .map((b) => ({ ...b, total: Math.max(0, b.contribution_owing) + Math.max(0, b.fines_owing) + Math.max(0, b.loans_owing) + Math.max(0, b.events_owing) }))
    .filter((b) => b.total > 0)
    .sort((a, b) => b.total - a.total);
  const D = t.dashboard;

  return (
    <>
      <AppHeader lang={lang} t={t} back="/app" title={group.name} sub={[group.town, scheduleText(t, group)].filter(Boolean).join(" · ")} />
      <main className="wrap stack">
        <SubscriptionNotice group={group} t={t} lang={lang} />
        {openMeeting ? (
          <Link className="btn btn-block" href={`/app/g/${gid}/meetings/${openMeeting.id}`}>{t.meetings.continue}</Link>
        ) : count > 0 && (
          <Link className="btn btn-block" href={`/app/g/${gid}/meetings`}>{t.meetings.open}</Link>
        )}

        {count > 0 && <Link className="btn btn-ghost btn-block" href={`/app/g/${gid}/reminders`}>{t.remind.open}</Link>}
        {next.length > 0 && (
          <section className="mm-collector stack">
            <div>
              <span className="turn">{t.cycle.next}</span>
              <h2 style={{ margin: "8px 0 0" }}>{next[0]!.members?.name}</h2>
              <p className="small" style={{ margin: 0 }}>{fmtDate(lang, next[0]!.planned_date, { weekday: "long", day: "numeric", month: "long" })}</p>
            </div>
            {next.length > 1 && (
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                {next.slice(1).map((s, i) => <li key={i}>{s.members?.name} · {fmtDate(lang, s.planned_date, { day: "numeric", month: "short" })}</li>)}
              </ul>
            )}
          </section>
        )}

        <div className="grid2">
          <Link className="stat" href={`/app/g/${gid}/money`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="label">{t.money.fund}</div>
            <div className="value">{f(Number(acc?.fund_balance ?? 0))}</div>
            {(overdue?.length ?? 0) > 0 && <span className="chip chip-danger">{fill(t.money.overdueLoans, { n: overdue!.length })}</span>}
          </Link>
          <div className="stat">
            <div className="label">{t.nav.members}</div>
            <div className="value">{count}</div>
            <div className="small muted">{fill(t.members.hands, { n: hands })} · {f(hands * group.contribution_per_hand)}</div>
          </div>
        </div>

        <section className="stack">
          <h2>{D.whoOwes}</h2>
          {owing.length === 0 ? <p className="muted">{D.nobodyOwes}</p> : (
            <ul className="list">
              {owing.slice(0, 15).map((b) => (
                <li key={b.member_id}>
                  <Link className="row" href={`/app/g/${gid}/members/${b.member_id}`}>
                    <span className="row-main">
                      <span className="row-title">{b.name}</span>
                      <span className="row-sub">
                        {[
                          b.contribution_owing > 0 && `${f(b.contribution_owing)} ${D.contrib}`,
                          b.fines_owing > 0 && `${f(b.fines_owing)} ${D.fines}`,
                          b.loans_owing > 0 && `${f(b.loans_owing)} ${D.loans}`,
                          b.events_owing > 0 && `${f(b.events_owing)} ${D.events}`,
                        ].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="num" style={{ fontWeight: 700, color: "var(--danger)" }}>{f(b.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {count === 0 && (
          <div className="actions">
            <Link className="btn" href={`/app/g/${gid}/members/add`}>{t.members.add}</Link>
            <Link className="btn btn-ghost" href={`/app/g/${gid}/members/add#paste`}>{t.members.paste}</Link>
          </div>
        )}
        {me && <p className="small muted">{fill(t.group.youAre, { role: t.roles[me.role] })}</p>}
      </main>
    </>
  );
}
