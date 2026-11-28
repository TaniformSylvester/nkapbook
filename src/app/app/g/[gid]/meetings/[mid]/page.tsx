import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getGroupContext } from "@/lib/group";
import type { Snapshot } from "@/lib/offline/types";
import { MeetingMode } from "./MeetingMode";
import { applyRules } from "../../money/actions";
import { ApplyRules } from "../../money/ApplyRules";

export default async function MeetingPage({ params }: { params: Promise<{ gid: string; mid: string }> }) {
  const { gid, mid } = await params;
  const { sb, group, lang, t } = await getGroupContext(gid);
  if (!/^[0-9a-f-]{36}$/i.test(mid)) notFound();
  const { data } = await sb.rpc("meeting_snapshot", { p_meeting: mid });
  const snap = data as Snapshot | null;
  if (!snap || snap.meeting.group_id !== gid) notFound();
  const date = new Date(`${snap.meeting.date}T12:00:00`).toLocaleDateString(lang === "fr" ? "fr-CM" : "en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
  return (
    <>
      <AppHeader lang={lang} t={t} back={`/app/g/${gid}/meetings`} title={date} sub={group.name} />
      <main className="wrap">
        <MeetingMode
          initial={snap}
          lang={lang}
          currency={group.currency}
          t={{ live: t.live, methods: t.methods, attendance: t.attendance, meetings: t.meetings, common: t.common, fines: t.fines, loans: t.loans }}
        />
        <a className="btn btn-ghost btn-block no-print" style={{ marginTop: 16 }} href={`/app/g/${gid}/meetings/${mid}/print`}>{t.exports.printMeeting}</a>
        <section className="card stack no-print" style={{ marginTop: 16 }}>
          <ApplyRules action={applyRules.bind(null, gid, mid)} label={t.fines.apply} hint={t.fines.applyHint} done={t.fines.applied} />
        </section>
      </main>
    </>
  );
}
