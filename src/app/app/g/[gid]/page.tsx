import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { fill } from "@/i18n";
import { getGroupContext, scheduleText } from "@/lib/group";
import { formatFcfa } from "@/lib/money";

export default async function GroupOverview({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { sb, group, me, lang, t } = await getGroupContext(gid);
  const { data: members } = await sb.from("members").select("hands").eq("group_id", gid).eq("status", "active");
  const count = members?.length ?? 0;
  const hands = (members ?? []).reduce((s, m) => s + (m.hands as number), 0);

  return (
    <>
      <AppHeader lang={lang} t={t} back="/app" title={group.name} sub={[group.town, scheduleText(t, group)].filter(Boolean).join(" · ")} />
      <main className="wrap stack">
        <div className="grid2">
          <div className="stat">
            <div className="label">{t.nav.members}</div>
            <div className="value">{count}</div>
            <div className="small muted">{fill(t.members.hands, { n: hands })}</div>
          </div>
          <div className="stat">
            <div className="label">{t.groupForm.contribution}</div>
            <div className="value">{formatFcfa(group.contribution_per_hand, lang)}</div>
          </div>
        </div>
        <p className="note">{fill(t.group.expectedPerMeeting, { amount: formatFcfa(hands * group.contribution_per_hand, lang) })}</p>
        {me && <p className="small muted">{fill(t.group.youAre, { role: t.roles[me.role] })}</p>}
        {count === 0 && (
          <div className="actions">
            <Link className="btn" href={`/app/g/${gid}/members/add`}>{t.members.add}</Link>
            <Link className="btn btn-ghost" href={`/app/g/${gid}/members/add#paste`}>{t.members.paste}</Link>
          </div>
        )}
        <p className="small muted">{t.group.comingSoon}</p>
      </main>
    </>
  );
}
