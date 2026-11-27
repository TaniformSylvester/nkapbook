import { redirect } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { fill } from "@/i18n";
import { getT } from "@/i18n/server";
import { formatCmPhone } from "@/lib/phone";
import { supabaseServer } from "@/lib/supabase/server";
import { signOut } from "../login/actions";

type Row = { role: string; groups: { id: string; name: string; town: string | null } | null };

export default async function AppHome() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login");
  const { lang, t } = await getT();

  const { data } = await sb
    .from("members")
    .select("role, groups(id, name, town)")
    .eq("user_id", auth.user.id)
    .neq("role", "member")
    .eq("status", "active")
    .returns<Row[]>();
  const groups = (data ?? []).filter((r) => r.groups);

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
          <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {groups.map((r) => (
              <li key={r.groups!.id} className="card">
                <strong>{r.groups!.name}</strong>
                {r.groups!.town && <span className="muted"> · {r.groups!.town}</span>}
                <div className="small muted">{r.role}</div>
              </li>
            ))}
          </ul>
        )}
        <p className="small muted">{fill(t.app.signedInAs, { phone: formatCmPhone(auth.user.phone ?? "") })}</p>
        <form action={signOut}>
          <button className="btn btn-ghost">{t.common.signOut}</button>
        </form>
      </main>
    </>
  );
}
