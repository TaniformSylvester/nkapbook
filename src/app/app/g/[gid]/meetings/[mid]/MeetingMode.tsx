"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fill, type Dict, type Lang } from "@/i18n";
import { parseAmount } from "@/lib/forms";
import { formatFcfa } from "@/lib/money";
import { applyOps, remainingToday, type ViewMember } from "@/lib/offline/apply";
import { dropSynced, enqueue, listOps, loadSnapshot, markOps, removeOp, saveSnapshot } from "@/lib/offline/store";
import { ATTENDANCE, METHODS, type Attendance, type Method, type Op, type QueuedOp, type Snapshot } from "@/lib/offline/types";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { uuid } from "@/lib/uuid";

export type MeetingText = Pick<Dict, "live" | "methods" | "attendance" | "meetings" | "common" | "fines" | "loans">;
type SyncState = "idle" | "saving" | "offline";

export function MeetingMode({ initial, t, lang }: { initial: Snapshot; t: MeetingText; lang: Lang }) {
  const mid = initial.meeting.id;
  const [snap, setSnap] = useState<Snapshot>(initial);
  const [ops, setOps] = useState<QueuedOp[]>([]);
  const [sync, setSync] = useState<SyncState>("idle");
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const syncing = useRef(false);
  const again = useRef(false);
  const fcfa = (n: number) => formatFcfa(n, lang);

  const view = useMemo(() => applyOps(snap, ops), [snap, ops]);
  const pending = ops.filter((o) => !o.error && !o.synced).length;
  const failed = ops.filter((o) => o.error);
  const closed = view.meeting.status === "closed";

  const refreshOps = useCallback(async () => setOps(await listOps(mid)), [mid]);

  /** Send waiting ops, then fetch a fresh snapshot. Safe to call any time. */
  const runSync = useCallback(async () => {
    if (syncing.current) {
      again.current = true; // something new was recorded mid-sync: go again right after
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSync("offline");
      return;
    }
    syncing.current = true;
    setSync("saving");
    try {
      const sb = supabaseBrowser();
      const waiting = (await listOps(mid)).filter((o) => !o.error && !o.synced);
      if (waiting.length) {
        const body = waiting.map(({ error: _e, synced: _s, ...op }) => op);
        const { data, error } = await sb.rpc("sync_ops", { p_ops: body });
        if (error) throw error;
        await markOps(data as { id: string; ok: boolean; error?: string }[]);
      }
      const { data: fresh, error } = await sb.rpc("meeting_snapshot", { p_meeting: mid });
      if (error) throw error;
      if (fresh) {
        await saveSnapshot(fresh as Snapshot);
        await dropSynced(mid);
        setSnap(fresh as Snapshot);
      }
      setSync("idle");
    } catch {
      setSync(navigator.onLine ? "idle" : "offline");
    } finally {
      syncing.current = false;
      await refreshOps();
    }
    if (again.current) {
      again.current = false;
      await runSyncRef.current();
    }
  }, [mid, refreshOps]);
  const runSyncRef = useRef(runSync);
  runSyncRef.current = runSync;

  // Start from whichever copy is newer: the page's or the phone's.
  useEffect(() => {
    (async () => {
      const local = await loadSnapshot(mid);
      if (local && local.fetched_at > initial.fetched_at) setSnap(local);
      else await saveSnapshot(initial);
      await refreshOps();
      // keep this page available without network
      if ("caches" in window) caches.open("nk-v1-pages").then((c) => c.add(location.href)).catch(() => {});
      runSync();
    })();
    const on = () => runSync();
    const off = () => setSync("offline");
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const timer = setInterval(() => runSync(), 30_000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(timer);
    };
  }, [mid, initial, refreshOps, runSync]);

  const record = async (op: Op) => {
    await enqueue(op);
    await refreshOps();
    runSync();
  };
  const now = () => new Date().toISOString();

  const pay = (m: ViewMember, amount: number, method: Method = "cash", momo_ref?: string) =>
    amount > 0 && record({ type: "payment", id: uuid(), meeting_id: mid, member_id: m.id, amount, method, momo_ref, at: now() });
  const mark = (m: ViewMember, status: Attendance) =>
    record({ type: "attendance", id: uuid(), meeting_id: mid, member_id: m.id, status, at: now() });
  const nextAttendance = (a: Attendance | null): Attendance =>
    a === null ? "present" : ATTENDANCE[(ATTENDANCE.indexOf(a) + 1) % ATTENDANCE.length]!;

  const shown = view.members.filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()));
  const pct = view.totals.expected ? Math.min(100, Math.round((view.totals.collected / view.totals.expected) * 100)) : 0;

  return (
    <div className="mm">
      <div className="mm-bar" role="status">
        <div className="mm-totals">
          <div>
            <span className="small muted">{t.live.collected}</span>
            <div className="num mm-big">{fcfa(view.totals.collected)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="small muted">{t.live.expected}</span>
            <div className="num">{fcfa(view.totals.expected)}</div>
          </div>
        </div>
        <div className="mm-progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
        {(view.totals.fines > 0 || view.totals.loans > 0) && (
          <div className="small">{fill(t.live.otherToday, { fines: fcfa(view.totals.fines), loans: fcfa(view.totals.loans) })}</div>
        )}
        <div className={`mm-sync ${sync === "offline" && pending ? "is-offline" : ""}`}>
          {failed.length > 0
            ? fill(t.live.failed, { n: failed.length })
            : pending && sync === "offline"
              ? fill(t.live.pending, { n: pending })
              : pending || sync === "saving"
                ? t.live.saving
                : sync === "offline"
                  ? t.common.offline
                  : t.live.saved}
        </div>
      </div>

      {failed.length > 0 && (
        <div className="error stack">
          {failed.map((o) => (
            <div key={o.id} className="mm-failed">
              <span>{o.type}: {o.error}</span>
              <button className="btn-link" onClick={async () => { await removeOp(o.id); refreshOps(); }}>{t.live.discard}</button>
            </div>
          ))}
        </div>
      )}

      {closed && <p className="note">{t.live.closed}</p>}

      <Collectors view={view} t={t} fcfa={fcfa} closed={closed} record={record} mid={mid} />

      <div className="field">
        <label htmlFor="mm-q" className="visually-hidden">{t.live.search}</label>
        <input id="mm-q" className="input" type="search" placeholder={t.live.search} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <ul className="list">
        {shown.map((m) => {
          const left = remainingToday(m);
          const isOpen = open === m.id;
          return (
            <li key={m.id} className={`mm-row${m.pending ? " is-pending" : ""}`}>
              <div className="mm-line">
                <button className="mm-name" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : m.id)}>
                  <span className="row-title">{m.name}</span>
                  <span className="row-sub">
                    {m.hands > 1 ? `${m.hands}× · ` : ""}
                    {fill(t.live.paidOfDue, { paid: fcfa(m.paid_today), due: fcfa(m.due_today) })}
                    {m.owing_before > 0 && <span className="mm-owe"> · {fill(t.live.plusBefore, { owe: fcfa(m.owing_before) })}</span>}
                    {m.fines.length > 0 && <span className="mm-owe"> · {fill(t.live.finesOwed, { amount: fcfa(m.fines.reduce((a, f) => a + f.balance, 0)) })}</span>}
                  </span>
                </button>
                {!closed && (
                  <button
                    className={`mm-att${m.attendance ? ` att-${m.attendance}` : ""}`}
                    onClick={() => mark(m, nextAttendance(m.attendance))}
                    aria-label={`${m.name}: ${m.attendance ? t.attendance[m.attendance] : t.attendance.none}`}
                  >
                    {m.attendance ? t.attendance[m.attendance] : t.attendance.ask}
                  </button>
                )}
                {left > 0 && !closed ? (
                  <button className="btn mm-pay" onClick={() => pay(m, left)}>
                    {fill(t.live.pay, { amount: fcfa(left) })}
                  </button>
                ) : (
                  m.due_today > 0 && left === 0 && <span className="mm-paid">✓ {t.live.paid}</span>
                )}
              </div>
              {isOpen && <MemberPanel m={m} t={t} fcfa={fcfa} closed={closed} pay={pay} mark={mark} record={record} mid={mid} gid={snap.meeting.group_id} lang={lang} />}
            </li>
          );
        })}
      </ul>

      <CloseMeeting view={view} t={t} closed={closed} record={record} mid={mid} />
      <p className="small muted">{t.live.offlineReady}</p>
    </div>
  );
}

function MemberPanel({ m, t, fcfa, closed, pay, mark, record, mid, gid, lang }: {
  m: ViewMember; t: MeetingText; fcfa: (n: number) => string; closed: boolean; mid: string; gid: string; lang: Lang;
  pay: (m: ViewMember, a: number, method?: Method, ref?: string) => unknown;
  mark: (m: ViewMember, s: Attendance) => unknown;
  record: (op: Op) => Promise<void>;
}) {
  const owing = Math.max(0, m.owing_before + m.due_today - m.paid_today);
  const [amount, setAmount] = useState(owing ? String(owing) : "");
  const [method, setMethod] = useState<Method>("cash");
  const [ref, setRef] = useState("");
  const [fixing, setFixing] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  return (
    <div className="mm-panel stack">
      <p className="small">
        {fill(t.live.dueToday, { amount: fcfa(m.due_today) })}
        {m.owing_before > 0 && <> · {fill(t.live.owesBefore, { amount: fcfa(m.owing_before) })}</>}
      </p>
      {!closed && (
        <>
          <div className="segmented" role="group" aria-label="Attendance">
            {ATTENDANCE.map((a) => (
              <button key={a} type="button" className={`seg${m.attendance === a ? " on" : ""}`} aria-pressed={m.attendance === a} onClick={() => mark(m, a)}>
                {t.attendance[a]}
              </button>
            ))}
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor={`amt-${m.id}`}>{t.live.amount}</label>
              <input id={`amt-${m.id}`} className="input num" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`met-${m.id}`}>{t.live.method}</label>
              <select id={`met-${m.id}`} className="input" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                {METHODS.map((x) => <option key={x} value={x}>{t.methods[x]}</option>)}
              </select>
            </div>
          </div>
          {(method === "mtn_momo" || method === "orange_money") && (
            <div className="field">
              <label htmlFor={`ref-${m.id}`}>{t.live.momoRef}</label>
              <input id={`ref-${m.id}`} className="input" value={ref} maxLength={64} onChange={(e) => setRef(e.target.value)} />
            </div>
          )}
          <button
            className="btn btn-block"
            disabled={!parseAmount(amount)}
            onClick={() => {
              const a = parseAmount(amount);
              if (a) { pay(m, a, method, ref || undefined); setAmount(""); setRef(""); }
            }}
          >
            {t.live.record}
          </button>
        </>
      )}
      <FinesAndLoans m={m} t={t} fcfa={fcfa} closed={closed} record={record} mid={mid} gid={gid} lang={lang} />
      {m.payments.length > 0 && (
        <ul className="mm-payments">
          {m.payments.map((p) => (
            <li key={p.id} className={p.reversed ? "is-reversed" : ""}>
              <span className="num">{fcfa(p.amount)}</span> · {t.methods[p.method]}
              {p.momo_ref && <> · {p.momo_ref}</>}
              {p.reversed ? (
                <span className="chip chip-muted">{t.live.corrected}</span>
              ) : fixing === p.id ? (
                <span className="stack" style={{ display: "block", marginTop: 8 }}>
                  <label className="small" htmlFor={`why-${p.id}`}>{t.live.correctReason}</label>
                  <input id={`why-${p.id}`} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button
                    className="btn btn-ghost btn-block"
                    disabled={reason.trim().length < 3}
                    onClick={async () => {
                      await record({ type: "reverse", id: uuid(), meeting_id: mid, reverses: p.id, reason: reason.trim(), at: new Date().toISOString() });
                      setFixing(null); setReason("");
                    }}
                  >
                    {t.live.correctConfirm}
                  </button>
                </span>
              ) : (
                <button className="btn-link" onClick={() => setFixing(p.id)}>{t.live.correct}</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Collectors({ view, t, fcfa, closed, record, mid }: {
  view: ReturnType<typeof applyOps>; t: MeetingText; fcfa: (n: number) => string; closed: boolean; mid: string;
  record: (op: Op) => Promise<void>;
}) {
  if (view.collectors.length === 0) return <p className="small muted">{t.live.noCollector}</p>;
  return (
    <>
      {view.collectors.map((c) => (
        <CollectorCard key={c.slot_id} c={c} pot={view.totals.pot} t={t} fcfa={fcfa} closed={closed} record={record} mid={mid} />
      ))}
    </>
  );
}

function CollectorCard({ c, pot, t, fcfa, closed, record, mid }: {
  c: ReturnType<typeof applyOps>["collectors"][number]; pot: number; t: MeetingText; fcfa: (n: number) => string;
  closed: boolean; mid: string; record: (op: Op) => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(pot));
  const [method, setMethod] = useState<Method>("cash");
  const done = c.payouts.filter((p) => !p.reversed);
  return (
    <section className="mm-collector stack">
      <div>
        <span className="turn">{t.live.collectsToday}</span>
        <h2 style={{ margin: "8px 0 0" }}>{c.name}{c.hand_no > 1 ? ` (${c.hand_no})` : ""}</h2>
        <p className="small">{fill(t.live.pot, { amount: fcfa(pot) })}</p>
      </div>
      {done.map((p) => (
        <p key={p.id} className="small">
          ✓ {fill(t.live.payoutDone, { amount: fcfa(p.amount), method: t.methods[p.method] })}
          <br />
          {p.confirmed ? fill(t.live.confirmed, { name: c.name }) : fill(t.live.awaitingConfirm, { name: c.name })}
        </p>
      ))}
      {done.length === 0 && !closed && (
        <>
          <div className="grid2">
            <div className="field">
              <label htmlFor={`po-${c.slot_id}`}>{t.live.payoutAmount}</label>
              <input id={`po-${c.slot_id}`} className="input num" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`pom-${c.slot_id}`}>{t.live.method}</label>
              <select id={`pom-${c.slot_id}`} className="input" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                {METHODS.map((x) => <option key={x} value={x}>{t.methods[x]}</option>)}
              </select>
            </div>
          </div>
          <button
            className="btn btn-block"
            disabled={!parseAmount(amount)}
            onClick={() => {
              const a = parseAmount(amount);
              if (a) record({ type: "payout", id: uuid(), meeting_id: mid, slot_id: c.slot_id, amount: a, method, at: new Date().toISOString() });
            }}
          >
            {t.live.recordPayout}
          </button>
        </>
      )}
    </section>
  );
}

function CloseMeeting({ view, t, closed, record, mid }: {
  view: ReturnType<typeof applyOps>; t: MeetingText; closed: boolean; mid: string; record: (op: Op) => Promise<void>;
}) {
  const [minutes, setMinutes] = useState(view.meeting.minutes ?? "");
  if (closed) return view.meeting.minutes ? <div className="card"><h3>{t.live.minutes}</h3><p style={{ whiteSpace: "pre-wrap" }}>{view.meeting.minutes}</p></div> : null;
  return (
    <section className="card stack">
      <div className="field">
        <label htmlFor="minutes">{t.live.minutes}</label>
        <textarea id="minutes" className="input" style={{ minHeight: 100 }} value={minutes} onChange={(e) => setMinutes(e.target.value)}
          onBlur={() => minutes !== (view.meeting.minutes ?? "") && record({ type: "minutes", id: uuid(), meeting_id: mid, minutes, at: new Date().toISOString() })} />
      </div>
      <button
        className="btn btn-ghost btn-block"
        onClick={() => { if (confirm(t.live.closeConfirm)) record({ type: "close", id: uuid(), meeting_id: mid, minutes, at: new Date().toISOString() }); }}
      >
        {t.live.close}
      </button>
    </section>
  );
}

const FINE_TYPES = ["late_payment", "absence", "lateness", "misconduct", "custom"] as const;

/** Unpaid fines and active loans, collected at the meeting even with no network. */
function FinesAndLoans({ m, t, fcfa, closed, record, mid, gid, lang }: {
  m: ViewMember; t: MeetingText; fcfa: (n: number) => string; closed: boolean; mid: string; gid: string; lang: Lang;
  record: (op: Op) => Promise<void>;
}) {
  const [fineType, setFineType] = useState<(typeof FINE_TYPES)[number]>("misconduct");
  const [fineAmount, setFineAmount] = useState("");
  const [repay, setRepay] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<Method>("cash");
  const at = () => new Date().toISOString();
  if (closed && m.fines.length === 0 && m.loans.length === 0) return null;
  return (
    <div className="stack mm-extra">
      {m.fines.length > 0 && (
        <div>
          <h4>{t.live.finesTitle}</h4>
          <ul className="mm-payments">
            {m.fines.map((f) => (
              <li key={f.id}>
                <span>{t.fines.types[f.type]} · <span className="num">{fcfa(f.balance)}</span></span>
                {!closed && (
                  <button className="btn mm-pay" style={{ marginLeft: "auto" }}
                    onClick={() => record({ type: "fine_payment", id: uuid(), meeting_id: mid, fine_id: f.id, amount: f.balance, method: "cash", at: at() })}>
                    {fill(t.live.payFine, { amount: fcfa(f.balance) })}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {m.loans.map((l) => (
        <div key={l.id} className="stack">
          <h4>{t.live.loanTitle} {l.overdue && <span className="chip chip-danger">{t.loans.overdue}</span>}</h4>
          <p className="small" style={{ margin: 0 }}>{fill(t.live.loanLeft, { amount: fcfa(l.balance), date: new Date(`${l.due_date}T12:00:00`).toLocaleDateString(lang === "fr" ? "fr-CM" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) })}</p>
          {!closed && (
            <>
              <div className="grid2">
                <div className="field">
                  <label htmlFor={`lr-${l.id}`}>{t.live.amount}</label>
                  <input id={`lr-${l.id}`} className="input num" inputMode="numeric" value={repay[l.id] ?? ""} onChange={(e) => setRepay({ ...repay, [l.id]: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor={`lm-${l.id}`}>{t.live.method}</label>
                  <select id={`lm-${l.id}`} className="input" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                    {METHODS.map((x) => <option key={x} value={x}>{t.methods[x]}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn btn-ghost btn-block" disabled={!parseAmount(repay[l.id] ?? "")}
                onClick={() => {
                  const a = parseAmount(repay[l.id] ?? "");
                  if (a) { record({ type: "loan_repayment", id: uuid(), meeting_id: mid, loan_id: l.id, amount: Math.min(a, l.balance), method, at: at() }); setRepay({ ...repay, [l.id]: "" }); }
                }}>
                {t.live.repay}
              </button>
            </>
          )}
        </div>
      ))}
      {!closed && (
        <details>
          <summary className="btn-link">{t.live.addFine}</summary>
          <div className="grid2">
            <div className="field">
              <label htmlFor={`ft-${m.id}`}>{t.fines.type}</label>
              <select id={`ft-${m.id}`} className="input" value={fineType} onChange={(e) => setFineType(e.target.value as (typeof FINE_TYPES)[number])}>
                {FINE_TYPES.map((x) => <option key={x} value={x}>{t.fines.types[x]}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`fa-${m.id}`}>{t.live.amount}</label>
              <input id={`fa-${m.id}`} className="input num" inputMode="numeric" value={fineAmount} onChange={(e) => setFineAmount(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-ghost btn-block" disabled={!parseAmount(fineAmount)}
            onClick={() => {
              const a = parseAmount(fineAmount);
              if (a) { record({ type: "fine", id: uuid(), meeting_id: mid, group_id: gid, member_id: m.id, fine_type: fineType, amount: a, at: at() }); setFineAmount(""); }
            }}>
            {t.live.addFine}
          </button>
        </details>
      )}
    </div>
  );
}
