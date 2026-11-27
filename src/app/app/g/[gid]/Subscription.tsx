import Link from "next/link";
import { fill, type Dict, type Lang } from "@/i18n";
import { fmtDate } from "@/lib/dates";
import { formatFcfa } from "@/lib/money";
import { groupRef, subscriptionConfig, subscriptionState } from "@/lib/subscription";
import type { Group } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Douala" });

/** Friendly notice on the Overview when the plan ends within a week or has ended. Never blocks anything. */
export function SubscriptionNotice({ group, t, lang }: { group: Group; t: Dict; lang: Lang }) {
  const s = subscriptionState(group, today());
  if (s.kind !== "ending" && s.kind !== "expired") return null;
  const S = t.sub;
  return (
    <div className="mm-collector stack" role="status">
      <p style={{ margin: 0 }}>
        <strong>{s.kind === "ending" ? fill(S.endingSoon, { date: fmtDate(lang, s.until) }) : s.until ? fill(S.ended, { date: fmtDate(lang, s.until) }) : S.title}</strong>
        <br />
        <span className="small">{S.safe}</span>
      </p>
      <Link className="btn btn-ghost btn-block" href={`/app/g/${group.id}/settings#subscription`}>{S.renew}</Link>
    </div>
  );
}

type Payment = { id: string; months: number; amount: number; paid_until_after: string; recorded_at: string };

export function SubscriptionSection({ group, payments, t, lang }: { group: Group; payments: Payment[]; t: Dict; lang: Lang }) {
  const S = t.sub;
  const cfg = subscriptionConfig();
  const s = subscriptionState(group, today());
  const f = (n: number) => formatFcfa(n, lang);
  const ref = groupRef(group.id);
  const status =
    s.kind === "pilot" ? S.pilot
    : s.kind === "free" ? S.free
    : s.kind === "expired" ? (s.until ? fill(S.ended, { date: fmtDate(lang, s.until) }) : S.title)
    : s.kind === "ending" ? fill(S.endingSoon, { date: fmtDate(lang, s.until) })
    : fill(S.activeUntil, { date: fmtDate(lang, s.until) });
  const hasWay = cfg.mtn || cfg.orange;

  return (
    <section id="subscription" className="card stack">
      <h2 style={{ margin: 0 }}>{S.title}</h2>
      <p style={{ margin: 0 }}><strong>{status}</strong></p>
      <p className="small muted" style={{ margin: 0 }}>{fill(S.price, { amount: f(cfg.price) })}</p>
      {s.kind !== "pilot" && s.kind !== "free" && (
        hasWay ? (
          <>
            <h3 style={{ margin: 0 }}>{S.howTo}</h3>
            <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
              <li>
                {fill(S.step1, { amount: f(cfg.price), three: f(cfg.price * 3) })}
                <ul style={{ paddingLeft: 16 }}>
                  {cfg.mtn && <li>{fill(S.mtn, { number: cfg.mtn })}</li>}
                  {cfg.orange && <li>{fill(S.orange, { number: cfg.orange })}</li>}
                  {cfg.payee && <li>{fill(S.payee, { name: cfg.payee })}</li>}
                </ul>
              </li>
              <li>{fill(S.step2, { ref })}</li>
              <li>{S.step3}</li>
            </ol>
            {cfg.whatsapp && (
              <a className="btn btn-ghost btn-block" target="_blank" rel="noopener"
                href={waLink(cfg.whatsapp, fill(S.waText, { group: group.name, ref, amount: f(cfg.price), months: 1 }))}>
                {S.tellUs}
              </a>
            )}
          </>
        ) : (
          <p className="small muted">{S.notConfigured}</p>
        )
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
