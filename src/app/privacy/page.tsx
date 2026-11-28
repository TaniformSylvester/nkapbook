import { Footer } from "@/components/Footer";
import { TopBar } from "@/components/TopBar";
import { privacyPolicy, UPDATED } from "@/content/privacy";
import { getT } from "@/i18n/server";
import { fmtDate } from "@/lib/dates";

export async function generateMetadata() {
  const { lang } = await getT();
  return { title: privacyPolicy(lang).title };
}

export default async function PrivacyPage() {
  const { lang, t } = await getT();
  const P = privacyPolicy(lang);
  return (
    <>
      <TopBar lang={lang} t={t} />
      <main className="wrap prose">
        <h1>{P.title}</h1>
        <p className="small muted">{P.updated} {fmtDate(lang, UPDATED)}</p>
        {lang === "pcm" && <p className="note small">{t.footer.englishOnly}</p>}
        {P.intro.map((x) => <p key={x}>{x}</p>)}
        {P.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.ul && <ul>{s.ul.map((x) => <li key={x}>{x}</li>)}</ul>}
            {s.p?.map((x) => <p key={x}>{x}</p>)}
          </section>
        ))}
      </main>
      <Footer t={t} />
    </>
  );
}
