import { AppHeader } from "@/components/AppHeader";
import { getGroupContext } from "@/lib/group";

export default async function ExportPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { group, lang, t } = await getGroupContext(gid);
  const X = t.exports;
  const files = [["ledger", X.ledger], ["members", X.members], ["meetings", X.meetings], ["attendance", X.attendance], ["loans", X.loans], ["fines", X.fines]] as const;
  return (
    <>
      <AppHeader lang={lang} t={t} back={`/app/g/${gid}/settings`} title={X.title} sub={group.name} />
      <main className="wrap stack">
        <p className="small muted">{X.lead}</p>
        <h2>{X.csv}</h2>
        <ul className="list">
          {files.map(([f, label]) => (
            <li key={f}><a className="row" href={`/app/g/${gid}/export/${f}.csv`} download>
              <span className="row-main"><span className="row-title">{label}</span><span className="row-sub">{f}.csv</span></span>
              <span aria-hidden="true">⬇</span>
            </a></li>
          ))}
        </ul>
        <p className="small muted">{X.printMeeting}: {t.nav.meetings} → … · {X.printStatement}: {t.nav.members} → …</p>
      </main>
    </>
  );
}
