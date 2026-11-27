import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getT } from "@/i18n/server";
import { fill, type Dict } from "@/i18n";
import { supabaseServer } from "@/lib/supabase/server";
import type { Group, Member } from "@/lib/types";

/** Everything an official page for one group needs. 404s if the user can't see the group. */
export const getGroupContext = cache(async (gid: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(gid)) notFound();
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: group } = await sb.from("groups").select("*").eq("id", gid).maybeSingle<Group>();
  if (!group) notFound();
  const { data: me } = await sb
    .from("members")
    .select("*")
    .eq("group_id", gid)
    .eq("user_id", auth.user.id)
    .maybeSingle<Member>();
  const { lang, t } = await getT(group.language);
  const isOfficial = !!me && me.role !== "member" && me.status === "active";
  return { sb, user: auth.user, group, me, isOfficial, isPresident: isOfficial && me!.role === "president", lang, t };
});

export function scheduleText(t: Dict, g: Pick<Group, "frequency" | "meeting_day">) {
  if (g.frequency === "monthly") return fill(t.schedule.monthly, { n: g.meeting_day });
  return fill(t.schedule[g.frequency], { day: t.days[g.meeting_day] ?? "" });
}
