import Link from "next/link";
import type { Dict, Lang } from "@/i18n";
import { LangSwitch } from "./LangSwitch";

/** Header for official pages: a back link, the page title and the language switch. */
export function AppHeader({ lang, t, back, title, sub }: { lang: Lang; t: Dict; back: string; title: string; sub?: string }) {
  return (
    <header className="apphead">
      <div className="apphead-row">
        <Link href={back} className="back" aria-label={t.nav.back}>
          <span aria-hidden="true">←</span>
        </Link>
        <LangSwitch current={lang} t={t} />
      </div>
      <h1>{title}</h1>
      {sub && <p className="muted small">{sub}</p>}
    </header>
  );
}
