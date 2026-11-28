import { redirect } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { getT } from "@/i18n/server";
import { getUser } from "@/lib/supabase/server";
import { pendingPhone, type LoginError } from "./actions";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

const ERRORS: LoginError[] = ["phone", "code", "tooMany", "generic"];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ step?: string; e?: string; change?: string }> }) {
  if (await getUser()) redirect("/app");
  const sp = await searchParams;
  const { lang, t } = await getT();
  const phone = sp.change ? null : await pendingPhone();
  const step = sp.step === "code" && phone ? "code" : "phone";
  const error = ERRORS.includes(sp.e as LoginError) ? (sp.e as LoginError) : null;
  return (
    <>
      <TopBar lang={lang} t={t} />
      <main className="wrap">
        <div className="card">
          <LoginForm t={t.login} step={step} phone={phone} error={error} />
        </div>
      </main>
    </>
  );
}
