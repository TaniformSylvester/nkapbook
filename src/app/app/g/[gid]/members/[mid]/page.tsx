import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { AppHeader } from "@/components/AppHeader";
import { getGroupContext } from "@/lib/group";
import type { Member } from "@/lib/types";
import { updateMember } from "../../actions";
import { LinkBlock, type Link } from "../../LinkBlock";
import { InviteForm, PendingInvite, RoleForm, type Invite } from "../../OfficialsBlocks";
import { MemberFields } from "../MemberFields";

export default async function MemberPage({ params }: { params: Promise<{ gid: string; mid: string }> }) {
  const { gid, mid } = await params;
  const { sb, group, isPresident, lang, t } = await getGroupContext(gid);
  if (!/^[0-9a-f-]{36}$/i.test(mid)) notFound();
  const { data: m } = await sb.from("members").select("*").eq("id", mid).eq("group_id", gid).maybeSingle<Member>();
  if (!m) notFound();
  const [{ data: invites }, { count: samePhone }, { data: link }] = await Promise.all([
    sb
      .from("official_invites")
      .select("id, member_id, phone, role, created_at")
      .eq("member_id", mid)
      .is("accepted_at", null)
      .is("cancelled_at", null)
      .returns<Invite[]>(),
    m.phone
      ? sb.from("members").select("id", { count: "exact", head: true }).eq("group_id", gid).eq("phone", m.phone).neq("id", mid)
      : Promise.resolve({ count: 0 }),
    sb.from("member_links").select("token, created_at, last_opened_at").eq("member_id", mid).is("revoked_at", null).maybeSingle<Link>(),
  ]);
  const pending = invites?.[0];

  return (
    <>
      <AppHeader lang={lang} t={t} back={`/app/g/${gid}/members`} title={m.name} sub={t.roles[m.role]} />
      <main className="wrap stack">
        {(samePhone ?? 0) > 0 && <p className="note">{t.members.duplicatePhone}</p>}
        {m.status === "active" && (
          <section className="card stack">
            <h2 style={{ margin: 0 }}>{t.link.title}</h2>
            <LinkBlock gid={gid} m={m} link={link} groupName={group.name} t={t} lang={lang} />
          </section>
        )}
        <ActionForm action={updateMember.bind(null, gid, mid)} errors={t.errors} submit={t.members.save} className="card stack">
          <MemberFields t={t} m={m} withStatus />
        </ActionForm>

        <section className="stack">
          <h2>{t.officials.title}</h2>
          {!isPresident ? (
            <p className="small muted">{t.officials.onlyPresident}</p>
          ) : m.user_id ? (
            <div className="card"><RoleForm gid={gid} m={m} t={t} /></div>
          ) : pending ? (
            <PendingInvite gid={gid} inv={pending} member={m} groupName={group.name} t={t} canCancel />
          ) : (
            <div className="card stack">
              <h3>{t.officials.inviteTitle}</h3>
              <InviteForm gid={gid} m={m} t={t} />
            </div>
          )}
        </section>
      </main>
    </>
  );
}
