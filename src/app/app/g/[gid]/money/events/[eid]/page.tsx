import { randomUUID } from "node:crypto";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { AppHeader } from "@/components/AppHeader";
import { AmountField, MethodSelect, OpId } from "@/components/Fields";
import { fill } from "@/i18n";
import { getGroupContext } from "@/lib/group";
import { formatFcfa } from "@/lib/money";
import { eventPayout, payEvent } from "../../actions";

export default async function EventPage({ params }: { params: Promise<{ gid: string; eid: string }> }) {
  const { gid, eid } = await params;
  const { sb, lang, t } = await getGroupContext(gid);
  if (!/^[0-9a-f-]{36}$/i.test(eid)) notFound();
  const { data: ev } = await sb.from("social_events").select("*").eq("id", eid).eq("group_id", gid).maybeSingle();
  if (!ev) notFound();
  const [{ data: rows }, { data: payouts }, { data: forMember }] = await Promise.all([
    sb.from("event_balances").select("member_id, member_name, due, paid").eq("event_id", eid).order("member_name"),
    sb.from("ledger_net").select("id, net").eq("event_id", eid).eq("kind", "event_payout"),
    ev.for_member_id ? sb.from("members").select("name").eq("id", ev.for_member_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const f = (n: number) => formatFcfa(n, lang);
  const E = t.events;
  const due = (rows ?? []).reduce((s, r) => s + Number(r.due), 0);
  const paid = (rows ?? []).reduce((s, r) => s + Number(r.paid), 0);
  const handed = (payouts ?? []).reduce((s, r) => s + Number(r.net), 0);
  const forName = (forMember as { name: string } | null)?.name;

  return (
    <>
      <AppHeader lang={lang} t={t} back={`/app/g/${gid}/money/events`} title={ev.title as string} sub={`${E.kinds[ev.kind as keyof typeof E.kinds]}${forName ? ` · ${forName}` : ""}`} />
      <main className="wrap stack">
        <div className="mm-bar" style={{ position: "static", margin: 0, borderRadius: "var(--radius)" }}>
          <div className="mm-totals">
            <div><span className="small muted">{t.live.collected}</span><div className="num mm-big">{f(paid)}</div></div>
            <div style={{ textAlign: "right" }}><span className="small muted">{t.live.expected}</span><div className="num">{f(due)}</div></div>
          </div>
        </div>
        <ul className="list">
          {(rows ?? []).map((r) => {
            const left = Number(r.due) - Number(r.paid);
            return (
              <li key={r.member_id as string} className="mm-line">
                <span className="mm-name" style={{ cursor: "default" }}>
                  <span className="row-title">{r.member_name as string}</span>
                  <span className="row-sub">{fill(t.live.paidOfDue, { paid: f(Number(r.paid)), due: f(Number(r.due)) })}</span>
                </span>
                {left > 0 ? (
                  <form action={payEvent.bind(null, gid, eid, r.member_id as string, left, randomUUID())}>
                    <button className="btn mm-pay">{fill(E.pay, { amount: f(left) })}</button>
                  </form>
                ) : <span className="mm-paid">✓ {E.paid}</span>}
              </li>
            );
          })}
        </ul>
        {forName && (
          <section className="mm-collector stack">
            {handed > 0 && <p>✓ {fill(E.handedOver, { amount: f(handed) })}</p>}
            <ActionForm action={eventPayout.bind(null, gid, eid)} errors={t.errors} submit={fill(E.handOver, { name: forName })} okText={t.money.saved}>
              <OpId />
              <div className="grid2">
                <AmountField label={t.money.amount} defaultValue={Math.max(0, paid - handed) || undefined} />
                <MethodSelect t={t} />
              </div>
            </ActionForm>
          </section>
        )}
      </main>
    </>
  );
}
