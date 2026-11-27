import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getGroupContext } from "@/lib/group";
import type { Snapshot } from "@/lib/offline/types";
import { MeetingMode } from "./MeetingMode";

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
          t={{ live: t.live, methods: t.methods, attendance: t.attendance, meetings: t.meetings, common: t.common }}
        />
      </main>
    </>
  );
}
