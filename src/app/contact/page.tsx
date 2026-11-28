import { Footer } from "@/components/Footer";
import { TopBar } from "@/components/TopBar";
import { getT } from "@/i18n/server";
import { SUPPORT_EMAIL, supportWhatsapp } from "@/lib/site";
import { waLink } from "@/lib/whatsapp";

export async function generateMetadata() {
  const { t } = await getT();
  return { title: t.contact.title };
}

export default async function ContactPage() {
  const { lang, t } = await getT();
  const C = t.contact;
  const wa = supportWhatsapp();
  return (
    <>
      <TopBar lang={lang} t={t} />
      <main className="wrap stack prose">
        <h1>{C.title}</h1>
        <p>{C.lead}</p>
        <div className="card stack">
          <div>
            <div className="small muted">{C.email}</div>
            <a href={`mailto:${SUPPORT_EMAIL}`}><strong>{SUPPORT_EMAIL}</strong></a>
          </div>
          {wa && (
            <a className="btn btn-ghost btn-block" target="_blank" rel="noopener" href={waLink(wa, C.waText)}>
              {C.whatsapp}
            </a>
          )}
          <p className="small muted" style={{ margin: 0 }}>{C.reply}</p>
        </div>
        <p className="note small">{C.members}</p>
      </main>
      <Footer t={t} />
    </>
  );
}
