import Link from "next/link";
import type { Dict } from "@/i18n";

export function Footer({ t }: { t: Dict }) {
  return (
    <footer className="wrap footer small muted">
      <Link href="/contact">{t.footer.contact}</Link>
      <span aria-hidden="true">·</span>
      <Link href="/privacy">{t.footer.privacy}</Link>
    </footer>
  );
}
