import Link from "next/link";
import type { Dict, Lang } from "@/i18n";
import { LangSwitch } from "./LangSwitch";
import { Logo } from "./Logo";

export function TopBar({ lang, t, home = "/" }: { lang: Lang; t: Dict; home?: string }) {
  return (
    <header className="topbar">
      <Link href={home} aria-label="NkapBook">
        <Logo />
      </Link>
      <LangSwitch current={lang} t={t} />
    </header>
  );
}
