import { ActionForm } from "@/components/ActionForm";
import { fill, type Dict } from "@/i18n";
import { SITE_URL } from "@/lib/env";
import { formatPhone } from "@/lib/phone";
import { OFFICIAL_ROLES, ROLES, type Member, type Role } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";
import { cancelInvite, changeRole, inviteOfficial } from "./actions";

export type Invite = { id: string; member_id: string; phone: string; role: Role; created_at: string };

export function PendingInvite({ gid, inv, member, groupName, t, canCancel }: {
  gid: string; inv: Invite; member?: Pick<Member, "name">; groupName: string; t: Dict; canCancel: boolean;
}) {
  const site = SITE_URL.replace(/^https?:\/\//, "");
  const msg = fill(t.officials.waInvite, { name: member?.name ?? "", role: t.roles[inv.role], group: groupName, url: site });
  return (
    <div className="card stack">
      <p>
        <strong>{member?.name}</strong> <span className="chip">{t.roles[inv.role]}</span>
        <br />
        <span className="small muted">{t.officials.pending} · {formatPhone(inv.phone)}</span>
      </p>
      <a className="btn btn-ghost btn-block" href={waLink(inv.phone, msg)} target="_blank" rel="noopener">
        {t.officials.tellWhatsApp}
      </a>
      {canCancel && (
        <form action={cancelInvite.bind(null, gid, inv.id)}>
          <button className="btn-link">{t.officials.cancel}</button>
        </form>
      )}
    </div>
  );
}

export function InviteForm({ gid, m, t }: { gid: string; m: Member; t: Dict }) {
  if (!m.phone) return <p className="muted">{t.officials.needsPhone}</p>;
  return (
    <ActionForm action={inviteOfficial.bind(null, gid, m.id)} errors={t.errors} submit={t.officials.invite}>
      <p className="small muted">{fill(t.officials.inviteLead, { phone: formatPhone(m.phone) })}</p>
      <div className="field">
        <label htmlFor="invite-role">{t.officials.role}</label>
        <select id="invite-role" name="role" className="input" defaultValue="secretary">
          {OFFICIAL_ROLES.map((r) => (
            <option key={r} value={r}>{t.roles[r]}</option>
          ))}
        </select>
      </div>
    </ActionForm>
  );
}

export function RoleForm({ gid, m, t }: { gid: string; m: Member; t: Dict }) {
  return (
    <ActionForm action={changeRole.bind(null, gid, m.id)} errors={t.errors} submit={t.officials.changeRole} okText={t.groupForm.saved}>
      {m.phone && <p className="small muted">{fill(t.officials.hasLogin, { phone: formatPhone(m.phone) })}</p>}
      <div className="field">
        <label htmlFor="role">{t.officials.role}</label>
        <select id="role" name="role" className="input" defaultValue={m.role}>
          {ROLES.map((r) => (
            <option key={r} value={r}>{t.roles[r]}</option>
          ))}
        </select>
      </div>
    </ActionForm>
  );
}
