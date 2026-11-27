import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { fill } from "@/i18n";
import { getGroupContext } from "@/lib/group";
import { formatCmPhone } from "@/lib/phone";
import type { Member } from "@/lib/types";

export default async function MembersPage({
  params,
  searchParams,
}: {
  params: Promise<{ gid: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  const { gid } = await params;
  const { added } = await searchParams;
  const { sb, group, lang, t } = await getGroupContext(gid);
  const { data } = await sb.from("members").select("*").eq("group_id", gid).order("name").returns<Member[]>();
  const all = data ?? [];
  const active = all.filter((m) => m.status === "active");
  const left = all.filter((m) => m.status === "left");
  const hands = active.reduce((s, m) => s + m.hands, 0);

  const row = (m: Member) => (
    <li key={m.id}>
      <Link href={`/app/g/${gid}/members/${m.id}`} className={`row${m.status === "left" ? " is-left" : ""}`}>
        <div className="row-main">
          <div className="row-title">
            {m.name} {m.role !== "member" && <span className="chip">{t.roles[m.role]}</span>}
          </div>
          <div className="row-sub">{m.phone ? formatCmPhone(m.phone) : t.members.noPhone}</div>
        </div>
        <div className="row-end">
          {m.status === "left" ? (
            <span className="chip chip-muted">{t.members.left}</span>
          ) : (
            <span className="hands">{m.hands === 1 ? t.members.hand : fill(t.members.hands, { n: m.hands })}</span>
          )}
        </div>
      </Link>
    </li>
  );

  return (
    <>
      <AppHeader
        lang={lang}
        t={t}
        back={`/app/g/${gid}`}
        title={t.members.title}
        sub={`${group.name} · ${fill(t.group.membersCount, { members: active.length, hands })}`}
      />
      <main className="wrap stack">
        {added && <p className="note" role="status">{fill(t.members.added, { n: Number(added) || 0 })}</p>}
        <div className="actions">
          <Link className="btn" href={`/app/g/${gid}/members/add`}>{t.members.add}</Link>
          <Link className="btn btn-ghost" href={`/app/g/${gid}/members/add#paste`}>{t.members.paste}</Link>
        </div>
        {active.length === 0 ? <p className="card">{t.members.empty}</p> : <ul className="list">{active.map(row)}</ul>}
        {left.length > 0 && (
          <details>
            <summary className="btn-link">{fill(t.members.showLeft, { n: left.length })}</summary>
            <ul className="list">{left.map(row)}</ul>
          </details>
        )}
      </main>
    </>
  );
}
