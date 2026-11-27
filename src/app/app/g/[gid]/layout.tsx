import { getGroupContext } from "@/lib/group";
import { GroupTabs } from "./GroupTabs";

export default async function GroupLayout({ children, params }: { children: React.ReactNode; params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { t } = await getGroupContext(gid);
  return (
    <>
      {children}
      <GroupTabs gid={gid} labels={{ overview: t.nav.overview, meetings: t.nav.meetings, members: t.nav.members, money: t.nav.money, settings: t.nav.settings }} />
    </>
  );
}
