import Link from "next/link";
import { Footer } from "@/components/Footer";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { fill } from "@/i18n";
import { getT } from "@/i18n/server";
import { formatPhone } from "@/lib/phone";
import { supabaseServer } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";
import { signOut } from "../login/actions";

type Row = { role: Role; groups: { id: string; name: string; town: string | null } | null };

export default async function AppHome() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login");
  // Pick up invites sent since the last sign-in.
  await sb.rpc("accept_invites");
  const { lang, t } = await getT();

  const { data } = await sb
    .from("members")
    .select("role, groups(id, name, town)")
    .eq("user_id", auth.user.id)
    .neq("role", "member")
    .eq("status", "active")
    .returns<Row[]>();
  const groups = (data ?? []).filter((r) => r.groups);
  const { data: admin } = await sb.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();

  return (
    <>
      <TopBar lang={lang} t={t} home="/app" />
      <main className="wrap stack">
        <h1>{t.app.myGroups}</h1>
        {groups.length === 0 ? (
          <div className="card stack">
            <p>{t.app.noGroups}</p>
            <p className="muted small">{t.app.noGroupsHint}</p>
          </div>
        ) : (
          <ul className="list">
            {groups.map((r) => (
              <li key={r.groups!.id}>
                <Link href={`/app/g/${r.groups!.id}`} className="row">
                  <div className="row-main">
                    <div className="row-title">{r.groups!.name}</div>
                    <div className="row-sub">{[r.groups!.town, t.roles[r.role]].filter(Boolean).join(" · ")}</div>
                  </div>
                  <span aria-hidden="true">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/app/new" className="btn btn-block">{t.app.createGroup}</Link>
        {admin && <Link href="/admin" className="btn btn-ghost btn-block">{t.admin.link}</Link>}
        <p className="small muted">{fill(t.app.signedInAs, { phone: formatPhone(auth.user.phone ?? "") })}</p>
        <form action={signOut}>
          <button className="btn btn-ghost">{t.common.signOut}</button>
        </form>
      </main>
      <Footer t={t} />
    </>
  );
}
