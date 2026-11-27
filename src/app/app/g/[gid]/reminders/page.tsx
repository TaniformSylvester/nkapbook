import { AppHeader } from "@/components/AppHeader";
import { fill, isLang, LANGS } from "@/i18n";
import { fmtDate } from "@/lib/dates";
import { getGroupContext } from "@/lib/group";
import { defaultReminderDate, loadReminderRows } from "@/lib/reminders/data";

export default async function RemindersPage({ params, searchParams }: {
  params: Promise<{ gid: string }>; searchParams: Promise<{ d?: string; l?: string; link?: string }>;
}) {
  const { gid } = await params;
  const sp = await searchParams;
  const { sb, group, lang, t } = await getGroupContext(gid);
  const date = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : await defaultReminderDate(sb, group);
  const msgLang = isLang(sp.l) ? sp.l : group.language;
  const withLink = sp.link === "1";
  const rows = await loadReminderRows(sb, group, date, msgLang, withLink);
  const R = t.remind;
  const sent = rows.filter((r) => r.sent_at).length;
  const withPhone = rows.filter((r) => r.phone).length;
  const q = (mid: string) => `?m=${mid}&d=${date}&l=${msgLang}${withLink ? "&link=1" : ""}`;

  return (
    <>
      <AppHeader lang={lang} t={t} back={`/app/g/${gid}/meetings`} title={R.title} sub={group.name} />
      <main className="wrap stack">
        <p className="small muted">{R.lead}</p>
        {/* plain GET form: works without JavaScript */}
        <form className="card stack" method="get">
          <div className="grid2">
            <div className="field">
              <label htmlFor="d">{R.forDate}</label>
              <input id="d" name="d" type="date" className="input" defaultValue={date} />
            </div>
            <div className="field">
              <label htmlFor="l">{R.language}</label>
              <select id="l" name="l" className="input" defaultValue={msgLang}>
                {LANGS.map((x) => <option key={x} value={x}>{t.lang[x]}</option>)}
              </select>
            </div>
          </div>
          <label className="check"><input type="checkbox" name="link" value="1" defaultChecked={withLink} /><span>{R.includeLink}</span></label>
          <button className="btn btn-ghost btn-block">OK</button>
        </form>
        <p className="note"><strong>{fill(R.progress, { sent, total: withPhone })}</strong></p>
        <ul className="list">
          {rows.map((r) => (
            <li key={r.member_id} className="mm-row">
              <div className="mm-line">
                <span className="mm-name" style={{ cursor: "default" }}>
                  <span className="row-title">{r.name}</span>
                  <span className="row-sub">{r.sent_at ? `✓ ${fill(R.sent, { time: fmtDate(lang, r.sent_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}` : r.phone ? "" : R.noPhone}</span>
                </span>
                {r.phone && (
                  <a className={`btn mm-pay${r.sent_at ? " btn-ghost" : ""}`} href={`/app/g/${gid}/reminders/send${q(r.member_id)}`} target="_blank" rel="noopener">
                    {R.send}
                  </a>
                )}
              </div>
              <details className="mm-panel">
                <summary className="btn-link">{R.preview}</summary>
                <p className="small" style={{ whiteSpace: "pre-wrap", background: "var(--paper)", padding: 8, borderRadius: 8 }}>{r.text}</p>
              </details>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
