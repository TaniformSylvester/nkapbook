import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { CopyButton } from "@/components/CopyButton";
import { fill, type Dict, type Lang } from "@/i18n";
import { fmtDate } from "@/lib/dates";
import { SITE_URL } from "@/lib/env";
import type { Member } from "@/lib/types";
import { waLink } from "@/lib/whatsapp";
import { resetLink } from "./actions";

export type Link = { token: string; created_at: string; last_opened_at: string | null };

export function memberUrl(token: string) {
  return `${SITE_URL}/m/${token}`;
}

export function LinkBlock({ gid, m, link, groupName, t, lang }: { gid: string; m: Member; link: Link | null; groupName: string; t: Dict; lang: Lang }) {
  const l = t.link;
  if (!link) {
    return (
      <form action={resetLink.bind(null, gid, m.id)} className="stack">
        <p className="small muted">{l.lead}</p>
        <button className="btn btn-block">{l.create}</button>
      </form>
    );
  }
  const url = memberUrl(link.token);
  const msg = fill(l.waMessage, { name: m.name.split(" ")[0] ?? m.name, group: groupName, url });
  return (
    <div className="stack">
      <p className="small muted">{l.lead}</p>
      <p className="code small" style={{ background: "var(--paper)", padding: 8, borderRadius: 8 }}>{url}</p>
      <p className="small muted">
        {link.last_opened_at ? fill(l.opened, { date: fmtDate(lang, link.last_opened_at, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }) : l.neverOpened}
      </p>
      <a className="btn btn-block" href={waLink(m.phone, msg)} target="_blank" rel="noopener">{l.send}</a>
      <CopyButton text={url} label={l.copy} done={l.copied} />
      <form action={resetLink.bind(null, gid, m.id)}>
        <ConfirmSubmit label={l.reset} question={l.resetConfirm} />
        <span className="small muted"> · {l.resetHint}</span>
      </form>
    </div>
  );
}
