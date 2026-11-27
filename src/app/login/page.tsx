import { redirect } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { getT } from "@/i18n/server";
import { getUser } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getUser()) redirect("/app");
  const { lang, t } = await getT();
  return (
    <>
      <TopBar lang={lang} t={t} />
      <main className="wrap">
        <div className="card">
          <LoginForm t={t.login} />
        </div>
      </main>
    </>
  );
}
