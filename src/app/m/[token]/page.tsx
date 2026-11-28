import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { LangSwitch } from "@/components/LangSwitch";
import { Logo } from "@/components/Logo";
import { fill, type Lang } from "@/i18n";
import { getT } from "@/i18n/server";
import { clientIp } from "@/lib/client-ip";
import { fmtDate } from "@/lib/dates";
import { formatFcfa } from "@/lib/money";
import type { Method } from "@/lib/offline/types";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { confirmPayout } from "./actions";

// Private page: never indexed, never cached by shared caches (see next.config.ts headers).
export const metadata: Metadata = { title: "My NkapBook", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Kind = "contribution_due" | "contribution_paid" | "payout" | "fine_charged" | "fine_paid" | "loan_disbursed" | "loan_interest"
  | "loan_repaid" | "event_due" | "event_paid" | "event_payout" | "fund_deposit" | "fund_withdrawal";
type View =
  | { status: "not_found" | "revoked" | "rate_limited" | "unavailable" }
  | {
      status: "ok";
      member: { name: string; hands: number; status: string };
      group: { name: string; town: string | null; language: Lang };
      totals: { paid: number; contribution_owing: number; credit: number; fines_owing: number; loans_owing: number; events_owing: number; received: number };
      next: { date: string; collector: string } | null;
      turns: { position: number; hand_no: number; planned_date: string; meeting_date: string | null }[];
      payouts: { id: string; amount: number; method: Method; date: string; confirmed_at: string | null }[];
      history: { id: string; kind: Kind; amount: number; method: Method | null; date: string; correction: boolean; reason: string | null; corrected: boolean }[];
    };

// Money in (+) or owed/received (no sign) from the member's point of view.
const PAID_KINDS: Kind[] = ["contribution_paid", "fine_paid", "loan_repaid", "event_paid", "fund_deposit"];

export default async function MemberPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let v: View = { status: "not_found" };
  if (/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
    try {
      const { data, error } = await supabaseAdmin().rpc("member_view", { p_token: token, p_ip: await clientIp() });
      if (error) throw error;
      if (data) v = data as View;
    } catch (e) {
      console.error("member_view failed", e);
      v = { status: "unavailable" };
    }
  }
  const { lang, t } = await getT(v.status === "ok" ? v.group.language : undefined);
  const me = t.me;
  const fcfa = (n: number) => formatFcfa(n, lang);
  const day = (d: string) => fmtDate(lang, d);

  const header = (
    <header className="topbar">
      <Logo />
      <LangSwitch current={lang} t={t} />
    </header>
  );

  if (v.status !== "ok") {
    const msg = v.status === "revoked" ? me.revoked : v.status === "rate_limited" ? me.rateLimited
      : v.status === "unavailable" ? t.errors.generic : me.notFound;
    return (
      <>
        {header}
        <main className="wrap"><p className="card">{msg}</p></main>
      </>
    );
  }

  const owing = v.totals.contribution_owing + v.totals.fines_owing + v.totals.events_owing;
  const upcoming = v.turns.filter((x) => !x.meeting_date);
  const done = v.turns.filter((x) => x.meeting_date);
  const toConfirm = v.payouts.filter((p) => !p.confirmed_at);

  return (
    <>
      {header}
      <main className="wrap stack me">
        <div>
          <p className="muted small" style={{ margin: 0 }}>{v.group.name}{v.group.town ? ` · ${v.group.town}` : ""}</p>
          <h1 style={{ marginBottom: 0 }}>{fill(me.hello, { name: v.member.name.split(" ")[0] ?? v.member.name })}</h1>
          {v.member.hands > 1 && <p className="small muted">{fill(me.hands, { n: v.member.hands })}</p>}
        </div>

        {toConfirm.map((p) => (
          <section key={p.id} className="mm-collector stack">
            <h2 style={{ margin: 0 }}>{me.payoutTitle}</h2>
            <p>{fill(me.payoutText, { amount: fcfa(p.amount), date: day(p.date), method: t.methods[p.method] })}</p>
            <form action={confirmPayout.bind(null, token, p.id)}>
              <button className="btn btn-block">{fill(me.confirmBtn, { amount: fcfa(p.amount) })}</button>
            </form>
          </section>
        ))}

        <div className="grid2">
          <div className="stat">
            <div className="label">{me.paid}</div>
            <div className="value">{fcfa(v.totals.paid)}</div>
          </div>
          <div className={`stat${owing > 0 ? " stat-owe" : ""}`}>
            <div className="label">{me.owing}</div>
            <div className="value">{fcfa(owing)}</div>
          </div>
        </div>
        {owing === 0 && <p className="note">{me.allClear}{v.totals.credit > 0 && <> {fill(me.credit, { amount: fcfa(v.totals.credit) })}</>}</p>}
        {(v.totals.fines_owing > 0 || v.totals.loans_owing > 0 || v.totals.events_owing > 0) && (
          <ul className="list">
            {v.totals.fines_owing > 0 && <li className="row"><span className="row-main">{me.fines}</span><span className="num">{fcfa(v.totals.fines_owing)}</span></li>}
            {v.totals.events_owing > 0 && <li className="row"><span className="row-main">{me.events}</span><span className="num">{fcfa(v.totals.events_owing)}</span></li>}
            {v.totals.loans_owing > 0 && <li className="row"><span className="row-main">{me.loans}</span><span className="num">{fcfa(v.totals.loans_owing)}</span></li>}
          </ul>
        )}

        <section className="stack">
          <h2>{me.yourTurn}</h2>
          {upcoming.length === 0 && done.length === 0 && <p className="muted">{me.noTurn}</p>}
          {upcoming[0] && (
            <p className="turn-big">
              <span className="turn">{fill(me.turnOn, { date: day(upcoming[0].planned_date) })}</span>
            </p>
          )}
          {upcoming.length > 1 && (
            <ul className="small" style={{ margin: 0 }}>
              {upcoming.map((x) => <li key={x.position}>{fill(me.turnHand, { n: x.hand_no, date: day(x.planned_date) })}</li>)}
            </ul>
          )}
          {done.map((x) => <p key={x.position} className="small">✓ {fill(me.turnDone, { date: day(x.meeting_date!) })}</p>)}
          {v.payouts.filter((p) => p.confirmed_at).map((p) => (
            <p key={p.id} className="small muted">{fcfa(p.amount)} · {fill(me.confirmed, { date: day(p.confirmed_at!) })}</p>
          ))}
          {v.next && (
            <p className="small muted">
              {fill(me.nextMeeting, { date: day(v.next.date) })}
              <br />
              {fill(me.nextCollector, { name: v.next.collector })}
            </p>
          )}
        </section>

        <section className="stack">
          <h2>{me.history}</h2>
          <p className="small muted">{me.historyLead}</p>
          {v.history.length === 0 ? (
            <p className="muted">{me.noHistory}</p>
          ) : (
            <ul className="list">
              {v.history.map((h) => (
                <li key={h.id} className={`row hist${h.corrected ? " is-corrected" : ""}`}>
                  <span className="row-main">
                    <span className="row-title">{h.correction ? `${me.correction}: ${me.kinds[h.kind]}` : me.kinds[h.kind]}</span>
                    <span className="row-sub">
                      {day(h.date)}
                      {h.method && !h.correction ? ` · ${t.methods[h.method]}` : ""}
                      {h.correction && h.reason ? ` · “${h.reason}”` : ""}
                      {h.corrected ? ` · ${me.correctedTag}` : ""}
                    </span>
                  </span>
                  <span className={`num${PAID_KINDS.includes(h.kind) && !h.correction ? " in" : ""}`}>
                    {h.correction ? "−" : ""}{fcfa(h.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="small muted">🔒 {me.privateNote}</p>
      </main>
      <Footer t={t} />
    </>
  );
}
