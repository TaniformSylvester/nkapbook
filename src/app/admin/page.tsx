import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { fill } from "@/i18n";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/dates";
import { formatFcfa } from "@/lib/money";
import { METHODS } from "@/lib/offline/types";
import { groupRef, subscriptionConfig, subscriptionState } from "@/lib/subscription";
import { supabaseServer } from "@/lib/supabase/server";
import { recordSubscription, setPlan } from "./actions";

export const metadata = { title: "Platform admin", robots: { index: false } };

type Row = { id: string; name: string; town: string | null; plan: "pilot" | "free" | "trial" | "paid"; created_at: string; members: number; meetings: number; paid_until: string | null };

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
  const { data } = await sb.rpc("admin_overview");
  const groups = (data ?? []) as Row[];
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Douala" });
  const prices = subscriptionConfig().prices;
  const f = (n: number) => formatFcfa(n, lang);

  return (
    <>
      <AppHeader lang={lang} t={t} back="/app" title={A.title} sub={`${A.groups}: ${groups.length}`} />
      <main className="wrap stack">
        <ul className="list">
          {groups.map((g) => {
            const s = subscriptionState(g, today);
            return (
              <li key={g.id} className="stack" style={{ padding: "12px 16px" }}>
                <div>
                  <div className="row-title">{g.name}{g.town ? ` · ${g.town}` : ""} <span className="small muted">{groupRef(g.id)}</span></div>
                  <div className="row-sub">{fill(A.stats, { members: Number(g.members), meetings: Number(g.meetings), date: fmtDate(lang, g.created_at, { day: "numeric", month: "short", year: "numeric" }) })}</div>
                  <div className="small">
                    <span className="chip">{A.plans[g.plan]}</span>{" "}
                    {g.plan === "trial" ? A.trialUntil : A.paidUntil}: <strong>{g.paid_until ? fmtDate(lang, g.paid_until) : A.noEnd}</strong>{" "}
                    {s.kind === "locked" && <span className="chip chip-danger">{A.locked}</span>}
                    {s.kind === "grace" && <span className="chip chip-danger">{A.grace}</span>}
                    {(s.kind === "trial" || s.kind === "active") && s.ending && <span className="chip">{s.daysLeft} d</span>}
                  </div>
                </div>
                <form action={setPlan.bind(null, g.id)} style={{ display: "flex", gap: 8 }}>
                  <label className="visually-hidden" htmlFor={`plan-${g.id}`}>{A.plan}</label>
                  <select id={`plan-${g.id}`} name="plan" className="input" defaultValue={g.plan} style={{ flex: 1 }}>
                    {(["trial", "paid", "pilot", "free"] as const).map((p) => <option key={p} value={p}>{A.plans[p]}</option>)}
                  </select>
                  <button className="btn" style={{ padding: "0 12px" }}>{A.save}</button>
                </form>
                <details>
                  <summary className="btn-link">{A.recordPayment}</summary>
                  <form action={recordSubscription.bind(null, g.id)} className="stack">
                    <div className="grid2">
                      <div className="field">
                        <label htmlFor={`m-${g.id}`}>{A.months}</label>
                        <select id={`m-${g.id}`} name="months" className="input" defaultValue="1">
                          {([1, 3, 6, 12] as const).map((n) => <option key={n} value={n}>{n} · {f(prices[n])}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor={`a-${g.id}`}>{t.money.amount}</label>
                        <input id={`a-${g.id}`} name="amount" className="input num" inputMode="numeric" required defaultValue={prices[1]} />
                      </div>
                    </div>
                    <div className="grid2">
                      <div className="field">
                        <label htmlFor={`me-${g.id}`}>{t.money.method}</label>
                        <select id={`me-${g.id}`} name="method" className="input" defaultValue="mtn_momo">
                          {METHODS.map((m) => <option key={m} value={m}>{t.methods[m]}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor={`r-${g.id}`}>{A.reference}</label>
                        <input id={`r-${g.id}`} name="reference" className="input" maxLength={64} />
                      </div>
                    </div>
                    <button className="btn btn-block">{A.recordPayment}</button>
                  </form>
                </details>
              </li>
            );
          })}
        </ul>
      </main>
    </>
  );
}
