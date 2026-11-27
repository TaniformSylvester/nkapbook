import { AppHeader } from "@/components/AppHeader";
import { fill, isLang, LANGS } from "@/i18n";
import { fmtDate } from "@/lib/dates";
import { getGroupContext } from "@/lib/group";

type Row = { id: string; name: string; phone: string | null };
type LinkRow = { member_id: string; shared_at: string | null; last_opened_at: string | null };

export default async function LinksPage({ params, searchParams }: { params: Promise<{ gid: string }>; searchParams: Promise<{ l?: string }> }) {
  const { gid } = await params;
  const { l } = await searchParams;
  const { sb, group, lang, t } = await getGroupContext(gid);
  const msgLang = isLang(l) ? l : group.language;
  const [{ data: members }, { data: links }] = await Promise.all([
    sb.from("members").select("id, name, phone").eq("group_id", gid).eq("status", "active").order("name").returns<Row[]>(),
    sb.from("member_links").select("member_id, shared_at, last_opened_at").eq("group_id", gid).is("revoked_at", null).returns<LinkRow[]>(),
  ]);
  const byMember = new Map((links ?? []).map((x) => [x.member_id, x]));
  const withPhone = (members ?? []).filter((m) => m.phone);
  const sent = withPhone.filter((m) => byMember.get(m.id)?.shared_at).length;
  const L = t.link;
  const d = (iso: string) => fmtDate(lang, iso, { day: "numeric", month: "short" });

  return (
    <>
      <AppHeader lang={lang} t={t} back={`/app/g/${gid}/members`} title={L.bulkTitle} sub={group.name} />
      <main className="wrap stack">
        <p className="small muted">{L.bulkLead}</p>
        <form method="get" className="field">
          <label htmlFor="l">{t.remind.language}</label>
          <div style={{ display: "flex", gap: 8 }}>
            <select id="l" name="l" className="input" defaultValue={msgLang}>
              {LANGS.map((x) => <option key={x} value={x}>{t.lang[x]}</option>)}
            </select>
            <button className="btn btn-ghost" style={{ padding: "0 16px" }}>OK</button>
          </div>
        </form>
        <p className="note"><strong>{fill(L.progress, { sent, total: withPhone.length })}</strong></p>
        <ul className="list">
          {(members ?? []).map((m) => {
            const link = byMember.get(m.id);
            const status = !m.phone ? L.noPhone
              : link?.last_opened_at ? fill(L.openedOn, { date: d(link.last_opened_at) })
              : link?.shared_at ? fill(L.sentOn, { date: d(link.shared_at) })
              : L.notSent;
            return (
              <li key={m.id} className="mm-line">
                <span className="mm-name" style={{ cursor: "default" }}>
                  <span className="row-title">{m.name}</span>
                  <span className="row-sub">{link?.shared_at || link?.last_opened_at ? "✓ " : ""}{status}</span>
                </span>
                {m.phone ? (
                  <a className={`btn mm-pay${link?.shared_at ? " btn-ghost" : ""}`} target="_blank" rel="noopener"
                    href={`/app/g/${gid}/links/send?m=${m.id}&l=${msgLang}`}>{t.remind.send}</a>
                ) : (
                  <a className="btn btn-ghost mm-pay" href={`/app/g/${gid}/members/${m.id}`}>{t.members.edit}</a>
                )}
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
