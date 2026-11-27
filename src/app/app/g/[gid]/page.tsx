import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { fill } from "@/i18n";
import { getGroupContext, scheduleText } from "@/lib/group";
import { formatFcfa } from "@/lib/money";

export default async function GroupOverview({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { sb, group, me, lang, t } = await getGroupContext(gid);
  const [{ data: members }, { data: openMeeting }, { data: nextSlots }] = await Promise.all([
    sb.from("members").select("hands").eq("group_id", gid).eq("status", "active"),
    sb.from("meetings").select("id").eq("group_id", gid).eq("status", "open").order("date", { ascending: false }).limit(1).maybeSingle(),
    sb.from("cycle_slots").select("planned_date, hand_no, members(name), cycles!inner(status)").eq("group_id", gid)
      .eq("cycles.status", "active").is("meeting_id", null).order("position").limit(group.collectors_per_meeting),
  ]);
  const next = (nextSlots ?? []) as unknown as { planned_date: string; hand_no: number; members: { name: string } | null }[];
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
        {next.length > 0 && (
          <div className="mm-collector">
            <span className="turn">{t.cycle.next}</span>
            <h2 style={{ margin: "8px 0 0" }}>{next.map((n) => n.members?.name).join(", ")}</h2>
            <p className="small">{new Date(`${next[0]!.planned_date}T12:00:00`).toLocaleDateString(lang === "fr" ? "fr-CM" : "en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
        )}
        {openMeeting ? (
          <Link className="btn btn-block" href={`/app/g/${gid}/meetings/${openMeeting.id}`}>{t.meetings.continue}</Link>
        ) : count > 0 && (
          <Link className="btn btn-block" href={`/app/g/${gid}/meetings`}>{t.meetings.open}</Link>
        )}
        {me && <p className="small muted">{fill(t.group.youAre, { role: t.roles[me.role] })}</p>}
        {count === 0 && (
          <div className="actions">
            <Link className="btn" href={`/app/g/${gid}/members/add`}>{t.members.add}</Link>
            <Link className="btn btn-ghost" href={`/app/g/${gid}/members/add#paste`}>{t.members.paste}</Link>
          </div>
        )}
      </main>
    </>
  );
}
