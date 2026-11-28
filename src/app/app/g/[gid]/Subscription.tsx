import Link from "next/link";
import { fill, type Dict, type Lang } from "@/i18n";
import { fmtDate } from "@/lib/dates";
import { formatFcfa } from "@/lib/money";
import { groupRef, stripeLinkFor, subscriptionConfig, subscriptionState, type SubState } from "@/lib/subscription";
import type { Group } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";

export const todayDouala = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Douala" });

/** One line describing where the group's plan stands. */
function statusText(s: SubState, S: Dict["sub"], lang: Lang) {
  const d = (x: string) => fmtDate(lang, x);
  switch (s.kind) {
    case "pilot": return S.pilot;
    case "free": return S.free;
    case "trial": return s.ending ? fill(S.trialEnding, { date: d(s.until) }) : fill(S.trialUntil, { date: d(s.until) });
    case "active": return s.ending ? fill(S.endingSoon, { date: d(s.until) }) : fill(S.activeUntil, { date: d(s.until) });
    case "grace": return fill(S.ended, { date: d(s.until) });
    case "locked": return s.until ? fill(S.paused, { date: d(s.until) }) : S.pausedShort;
  }
}

/** Notice on the Overview: a week before the end, during the grace period, and once new meetings are paused. */
export function SubscriptionNotice({ group, t, lang }: { group: Group; t: Dict; lang: Lang }) {
  const s = subscriptionState(group, todayDouala());
  const show = s.kind === "grace" || s.kind === "locked" || ((s.kind === "trial" || s.kind === "active") && s.ending);
  if (!show) return null;
  const S = t.sub;
  return (
    <div className="mm-collector stack" role="status">
      <p style={{ margin: 0 }}>
        <strong>{statusText(s, S, lang)}</strong>
        <br />
        <span className="small">
          {s.kind === "grace" ? fill(S.graceUntil, { date: fmtDate(lang, s.lockOn) }) : s.kind === "locked" ? null : S.safe}
        </span>
      </p>
      <Link className="btn btn-ghost btn-block" href={`/app/g/${group.id}/settings#subscription`}>{S.renew}</Link>
    </div>
  );
}

type Payment = { id: string; months: number; amount: number; paid_until_after: string; recorded_at: string };

export function SubscriptionSection({ group, payments, t, lang }: { group: Group; payments: Payment[]; t: Dict; lang: Lang }) {
  const S = t.sub;
  const cfg = subscriptionConfig();
  const s = subscriptionState(group, todayDouala());
  const f = (n: number) => formatFcfa(n, lang);
  const ref = groupRef(group.id);
  const hasWay = cfg.mtn || cfg.orange || cfg.stripeLink;

  return (
    <section id="subscription" className="card stack">
      <h2 style={{ margin: 0 }}>{S.title}</h2>
      <p style={{ margin: 0 }}><strong>{statusText(s, S, lang)}</strong></p>
      {s.kind === "grace" && <p className="small" style={{ margin: 0 }}>{fill(S.graceUntil, { date: fmtDate(lang, s.lockOn) })}</p>}
      {s.kind !== "pilot" && s.kind !== "free" && (
        <>
          <p className="small muted" style={{ margin: 0 }}>{fill(S.prices, { m1: f(cfg.prices[1]), m6: f(cfg.prices[6]), m12: f(cfg.prices[12]) })}</p>
          {hasWay ? (
            <>
              <h3 style={{ margin: 0 }}>{S.howTo}</h3>
              {(cfg.mtn || cfg.orange) && (
                <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
                  <li>
                    {S.step1}
                    <ul style={{ paddingLeft: 16 }}>
                      {cfg.mtn && <li>{fill(S.mtn, { number: cfg.mtn })}</li>}
                      {cfg.orange && <li>{fill(S.orange, { number: cfg.orange })}</li>}
                      {cfg.payee && <li>{fill(S.payee, { name: cfg.payee })}</li>}
                    </ul>
                  </li>
                  <li>{fill(S.step2, { ref })}</li>
                  <li>{S.step3}</li>
                </ol>
              )}
              {cfg.whatsapp && (cfg.mtn || cfg.orange) && (
                <a className="btn btn-ghost btn-block" target="_blank" rel="noopener"
                  href={waLink(cfg.whatsapp, fill(S.waText, { group: group.name, ref, amount: f(cfg.price), months: 1 }))}>
                  {S.tellUs}
                </a>
              )}
              {cfg.stripeLink && (
                <a className="btn btn-ghost btn-block" target="_blank" rel="noopener" href={stripeLinkFor(cfg.stripeLink, group.id)}>
                  {S.payByCard}
                </a>
              )}
            </>
          ) : (
            <p className="small muted">{S.notConfigured}</p>
          )}
        </>
      )}
      {payments.length > 0 && (
        <details>
          <summary className="btn-link">{S.history} ({payments.length})</summary>
          <ul className="small" style={{ paddingLeft: 18 }}>
            {payments.map((p) => (
              <li key={p.id}>
                {fmtDate(lang, p.recorded_at, { day: "numeric", month: "short", year: "numeric" })}: {fill(S.paymentRow, { amount: f(p.amount), months: p.months, date: fmtDate(lang, p.paid_until_after) })}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
