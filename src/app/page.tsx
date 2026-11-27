import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { getT } from "@/i18n/server";

export default async function Home() {
  const { lang, t } = await getT();
  return (
    <>
      <TopBar lang={lang} t={t} />
      <main className="wrap stack">
        <h1>{t.home.headline}</h1>
        <p className="muted">{t.home.lead}</p>
        <p className="note">{t.home.neverHold}</p>
        <Link href="/login" className="btn btn-block">
          {t.home.cta}
        </Link>
        <p className="small muted">{t.home.forMembers}</p>
      </main>
    </>
  );
}
