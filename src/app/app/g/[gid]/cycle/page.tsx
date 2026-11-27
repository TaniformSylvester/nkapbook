import { AppHeader } from "@/components/AppHeader";
import { fill } from "@/i18n";
import { getGroupContext } from "@/lib/group";
import { nextMeetingDate } from "@/lib/schedule";
import type { Member } from "@/lib/types";
import { completeCycle, saveCycle, startCycle } from "../meetings/actions";
import { CycleForm, type Hand } from "./CycleForm";

type Cycle = { id: string; number: number; status: "draft" | "active" | "completed"; order_method: string; first_date: string };
type Slot = { id: string; position: number; member_id: string; hand_no: number; planned_date: string; meeting_id: string | null };
type Draw = { id: string; seed: string; drawn_at: string; drawn_by: string | null; witness_note: string | null };

export default async function CyclePage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { sb, group, lang, t } = await getGroupContext(gid);
  const c = t.cycle;
  const [{ data: cycle }, { data: members }] = await Promise.all([
    sb.from("cycles").select("*").eq("group_id", gid).in("status", ["draft", "active"]).maybeSingle<Cycle>(),
    sb.from("members").select("*").eq("group_id", gid).order("name").returns<Member[]>(),
  ]);
  const byId = new Map((members ?? []).map((m) => [m.id, m]));
  const [{ data: slots }, { data: draws }] = cycle
    ? await Promise.all([
        sb.from("cycle_slots").select("*").eq("cycle_id", cycle.id).order("position").returns<Slot[]>(),
        sb.from("cycle_draws").select("id, seed, drawn_at, drawn_by, witness_note").eq("cycle_id", cycle.id).order("drawn_at", { ascending: false }).returns<Draw[]>(),
      ])
    : [{ data: [] as Slot[] }, { data: [] as Draw[] }];

  const active = (members ?? []).filter((m) => m.status === "active");
  const allHands: Hand[] = active.flatMap((m) => Array.from({ length: m.hands }, (_, i) => ({ member_id: m.id, name: m.name, hand_no: i + 1, hands: m.hands })));
  const currentOrder: Hand[] = (slots ?? []).map((s) => {
    const m = byId.get(s.member_id);
    return { member_id: s.member_id, name: m?.name ?? "?", hand_no: s.hand_no, hands: m?.hands ?? 1 };
  });
  const firstDate = cycle?.first_date ?? nextMeetingDate(group, new Date().toISOString().slice(0, 10));
  const fmt = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString(lang === "fr" ? "fr-CM" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  const whoName = (uid: string | null) => (members ?? []).find((m) => m.user_id === uid)?.name ?? "—";
  const nextPos = (slots ?? []).find((s) => !s.meeting_id)?.position;
  const formT = { cycle: t.cycle, errors: t.errors };

  return (
    <>
      <AppHeader lang={lang} t={t} back={`/app/g/${gid}/meetings`} title={c.title} sub={group.name} />
      <main className="wrap stack">
        {!cycle ? (
          active.length === 0 ? (
            <p className="card">{c.noMembers}</p>
          ) : (
            <div className="card stack">
              <p>{c.none}</p>
              <CycleForm t={formT} hands={allHands} firstDate={firstDate} action={saveCycle.bind(null, gid, null)} />
            </div>
          )
        ) : (
          <>
            <p>
              <span className={`chip${cycle.status === "draft" ? " chip-muted" : ""}`}>{cycle.status === "draft" ? c.draft : c.active}</span>
            </p>
            {draws && draws[0] && (
              <div className="card stack">
                <p className="small">
                  <strong>{fill(c.drawRecord, { date: fmt(draws[0].drawn_at), who: whoName(draws[0].drawn_by) })}</strong>
                  {draws[0].witness_note && <><br />“{draws[0].witness_note}”</>}
                </p>
                <p className="small muted">{c.drawCode.split("{seed}")[0]}<span className="code">{draws[0].seed}</span><br />{c.drawCodeHint}</p>
                {draws.length > 1 && (
                  <details>
                    <summary className="btn-link">{c.history} ({draws.length})</summary>
                    <ul className="small">
                      {draws.map((d) => <li key={d.id}>{fill(c.drawRecord, { date: fmt(d.drawn_at), who: whoName(d.drawn_by) })}{d.witness_note ? ` · “${d.witness_note}”` : ""}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}
            <ol className="list" style={{ paddingLeft: 0 }}>
              {(slots ?? []).map((s) => {
                const m = byId.get(s.member_id);
                const done = !!s.meeting_id;
                const isNext = s.position === nextPos;
                return (
                  <li key={s.id} className="row" style={done ? { opacity: 0.7 } : undefined}>
                    <span className="num" style={{ width: 28 }}>{s.position}</span>
                    <span className="row-main">
                      <span className="row-title">{m?.name}{(m?.hands ?? 1) > 1 ? ` · ${fill(c.handNo, { n: s.hand_no })}` : ""}</span>
                      <span className="row-sub">{fmt(s.planned_date)}</span>
                    </span>
                    {done ? <span className="chip chip-muted">{c.collected}</span> : isNext && cycle.status === "active" ? <span className="turn">{c.next}</span> : null}
                  </li>
                );
              })}
            </ol>
            {cycle.status === "draft" && (
              <>
                <form action={startCycle.bind(null, gid, cycle.id)} className="stack">
                  <button className="btn btn-block">{c.start}</button>
                  <p className="small muted">{c.startHint}</p>
                </form>
                <details className="card">
                  <summary className="btn-link">{c.drawAgain} / {c.setManual}</summary>
                  <CycleForm t={formT} hands={currentOrder} firstDate={firstDate} action={saveCycle.bind(null, gid, cycle.id)} submitDraw={c.drawAgain} />
                </details>
              </>
            )}
            {cycle.status === "active" && nextPos === undefined && (
              <form action={completeCycle.bind(null, gid, cycle.id)}>
                <button className="btn btn-ghost btn-block">{c.finish}</button>
              </form>
            )}
          </>
        )}
      </main>
    </>
  );
}
