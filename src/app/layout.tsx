import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { getT } from "@/i18n/server";
import "./globals.css";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-bricolage", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-dmsans", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return {
    title: { default: `NkapBook · ${t.meta.tagline}`, template: "%s · NkapBook" },
    description: t.meta.description,
    applicationName: "NkapBook",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
        { url: "/brand/nkapbook-symbol.svg", type: "image/svg+xml" },
      ],
      apple: "/icons/apple-touch-icon.png",
    },
    appleWebApp: { capable: true, title: "NkapBook", statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = { themeColor: "#0B5D3B", width: "device-width", initialScale: 1 };

// Registers the service worker without shipping a client component.
const swScript = `if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang } = await getT();
  return (
    <html lang={lang === "pcm" ? "en-CM" : lang} className={`${bricolage.variable} ${dmSans.variable}`}>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: swScript }} />
      </body>
    </html>
  );
}
