import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { fill } from "@/i18n";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/dates";
import { supabaseServer } from "@/lib/supabase/server";
import { setPlan } from "./actions";

export const metadata = { title: "Platform admin", robots: { index: false } };

export default async function AdminPage() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login");
  const { lang, t } = await getT();
  const A = t.admin;
  const { data: me } = await sb.from("platform_admins").select("user_id").eq("user_id", auth.user.id).maybeSingle();
  if (!me) {
    return (<><AppHeader lang={lang} t={t} back="/app" title={A.title} /><main className="wrap"><p className="card">{A.notAdmin}</p></main></>);
  }
  // Group-level numbers only: the admin never sees members' names or phone numbers.
  const { data: groups } = await sb.rpc("admin_overview");
  type Row = { id: string; name: string; town: string | null; plan: string; created_at: string; members: number; meetings: number };

  return (
    <>
      <AppHeader lang={lang} t={t} back="/app" title={A.title} sub={`${A.groups}: ${(groups as Row[] | null)?.length ?? 0}`} />
      <main className="wrap stack">
        <ul className="list">
          {((groups ?? []) as Row[]).map((g) => (
            <li key={g.id as string} className="row" style={{ flexWrap: "wrap" }}>
              <span className="row-main">
                <span className="row-title">{g.name as string}{g.town ? ` · ${g.town}` : ""}</span>
                <span className="row-sub">{fill(A.stats, {
                  members: Number(g.members),
                  meetings: Number(g.meetings),
                  date: fmtDate(lang, g.created_at as string, { day: "numeric", month: "short", year: "numeric" }),
                })}</span>
              </span>
              <form action={setPlan.bind(null, g.id as string)} style={{ display: "flex", gap: 8 }}>
                <label className="visually-hidden" htmlFor={`plan-${g.id}`}>{A.plan}</label>
                <select id={`plan-${g.id}`} name="plan" className="input" defaultValue={g.plan as string} style={{ width: 110 }}>
                  {(["pilot", "free", "paid"] as const).map((p) => <option key={p} value={p}>{A.plans[p]}</option>)}
                </select>
                <button className="btn" style={{ padding: "0 12px" }}>{A.save}</button>
              </form>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
