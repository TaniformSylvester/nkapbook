import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { fill } from "@/i18n";
import { fmtDate } from "@/lib/dates";
import { getGroupContext } from "@/lib/group";
import { formatFcfa } from "@/lib/money";
import { createEvent } from "../actions";
import { EventForm } from "./EventForm";

export default async function EventsPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { sb, group, lang, t } = await getGroupContext(gid);
  const [{ data: events }, { data: bal }, { data: members }] = await Promise.all([
    sb.from("social_events").select("id, title, kind, due_date, created_at").eq("group_id", gid).order("created_at", { ascending: false }),
    sb.from("event_balances").select("event_id, due, paid").eq("group_id", gid),
    sb.from("members").select("id, name").eq("group_id", gid).eq("status", "active").order("name"),
  ]);
  const sums = new Map<string, { due: number; paid: number }>();
  for (const b of bal ?? []) {
    const x = sums.get(b.event_id as string) ?? { due: 0, paid: 0 };
    x.due += Number(b.due);
    x.paid += Number(b.paid);
    sums.set(b.event_id as string, x);
  }
  const f = (n: number) => formatFcfa(n, lang);
  const E = t.events;
  return (
    <>
      <AppHeader lang={lang} t={t} back={`/app/g/${gid}/money`} title={E.title} sub={group.name} />
      <main className="wrap stack">
        {(events ?? []).length === 0 ? <p className="muted">{E.none}</p> : (
          <ul className="list">
            {(events ?? []).map((e) => {
              const s = sums.get(e.id as string) ?? { due: 0, paid: 0 };
              return (
                <li key={e.id as string}>
                  <Link className="row" href={`/app/g/${gid}/money/events/${e.id}`}>
                    <span className="row-main">
                      <span className="row-title">{e.title as string}</span>
                      <span className="row-sub">{E.kinds[e.kind as keyof typeof E.kinds]} · {fmtDate(lang, e.created_at as string, { day: "numeric", month: "short" })}</span>
                    </span>
                    <span className="num small">{fill(E.collected, { paid: f(s.paid), due: f(s.due) })}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <section className="card stack">
          <h2 style={{ margin: 0 }}>{E.new}</h2>
          <EventForm t={{ events: t.events, errors: t.errors, money: t.money }} members={members ?? []} action={createEvent.bind(null, gid, randomUUID())} />
        </section>
      </main>
    </>
  );
}
