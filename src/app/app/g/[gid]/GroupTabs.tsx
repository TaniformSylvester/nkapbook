"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Bottom navigation, within thumb reach on a small phone. */
export function GroupTabs({ gid, labels }: { gid: string; labels: { overview: string; meetings: string; members: string; settings: string } }) {
  const path = usePathname();
  const base = `/app/g/${gid}`;
  const items = [
    { href: base, label: labels.overview, active: path === base },
    { href: `${base}/meetings`, label: labels.meetings, active: path.startsWith(`${base}/meetings`) || path.startsWith(`${base}/cycle`) },
    { href: `${base}/members`, label: labels.members, active: path.startsWith(`${base}/members`) },
    { href: `${base}/settings`, label: labels.settings, active: path.startsWith(`${base}/settings`) },
  ];
  return (
    <nav className="bottomnav no-print" aria-label="Group">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.active ? "page" : undefined}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
