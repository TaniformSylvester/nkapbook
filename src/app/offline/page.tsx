import { Logo } from "@/components/Logo";
import en from "@/i18n/en";
import fr from "@/i18n/fr";
import pcm from "@/i18n/pcm";

export const dynamic = "force-static";

// Cached on the phone by the service worker; we can't know the language, so show all three.
export default function Offline() {
  return (
    <main className="wrap stack">
      <Logo />
      {[en, pcm, fr].map((t, i) => (
        <section key={i} lang={i === 2 ? "fr" : "en"}>
          <h2>{t.offlinePage.title}</h2>
          <p>{t.offlinePage.body}</p>
        </section>
      ))}
    </main>
  );
}
