import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { AppHeader } from "@/components/AppHeader";
import { GroupFields } from "@/components/GroupFields";
import { getGroupContext } from "@/lib/group";
import { formatCmPhone } from "@/lib/phone";
import type { Member } from "@/lib/types";
import { updateGroup } from "../actions";
import { PendingInvite, type Invite } from "../OfficialsBlocks";
import { SubscriptionSection } from "../Subscription";

export default async function SettingsPage({ params }: { params: Promise<{ gid: string }> }) {
  const { gid } = await params;
  const { sb, group, isPresident, lang, t } = await getGroupContext(gid);
  const [{ data: officials }, { data: invites }, { data: members }, { data: subPayments }] = await Promise.all([
    sb.from("members").select("*").eq("group_id", gid).neq("role", "member").eq("status", "active").order("role").returns<Member[]>(),
    sb
      .from("official_invites")
      .select("id, member_id, phone, role, created_at")
      .eq("group_id", gid)
      .is("accepted_at", null)
      .is("cancelled_at", null)
      .returns<Invite[]>(),
    sb.from("members").select("id, name").eq("group_id", gid),
    sb.from("subscription_payments").select("id, months, amount, paid_until_after, recorded_at").eq("group_id", gid).order("recorded_at", { ascending: false }),
  ]);
  const nameOf = new Map((members ?? []).map((m) => [m.id as string, { name: m.name as string }]));

  return (
    <>
      <AppHeader lang={lang} t={t} back={`/app/g/${gid}`} title={t.nav.settings} sub={group.name} />
      <main className="wrap stack">
        <ActionForm action={updateGroup.bind(null, gid)} errors={t.errors} submit={t.groupForm.save} okText={t.groupForm.saved} className="card stack">
          <GroupFields t={t} initial={group} />
          <div className="field">
            <label htmlFor="collectors">{t.cycle.perMeeting}</label>
            <select id="collectors" name="collectors" className="input" defaultValue={group.collectors_per_meeting}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <label className="check">
            <input type="checkbox" name="fines_to_fund" defaultChecked={group.fines_go_to_fund} />
            <span>{t.groupForm.finesToFund}</span>
          </label>
        </ActionForm>

        <section className="stack">
          <h2>{t.officials.title}</h2>
          <p className="small muted">{t.officials.lead}</p>
          <ul className="list">
            {(officials ?? []).map((o) => (
              <li key={o.id}>
                <Link href={`/app/g/${gid}/members/${o.id}`} className="row">
                  <div className="row-main">
                    <div className="row-title">{o.name}</div>
                    <div className="row-sub">{o.phone ? formatCmPhone(o.phone) : ""}</div>
                  </div>
                  <span className="chip">{t.roles[o.role]}</span>
                </Link>
              </li>
            ))}
          </ul>
          {(invites ?? []).map((inv) => (
            <PendingInvite key={inv.id} gid={gid} inv={inv} member={nameOf.get(inv.member_id)} groupName={group.name} t={t} canCancel={isPresident} />
          ))}
          <p className="small muted">{isPresident ? t.officials.howTo : t.officials.onlyPresident}</p>
        </section>
        <SubscriptionSection group={group} payments={subPayments ?? []} t={t} lang={lang} />
        <Link className="btn btn-ghost btn-block" href={`/app/g/${gid}/export`}>{t.exports.title}</Link>
      </main>
    </>
  );
}
