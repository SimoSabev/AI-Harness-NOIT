import type { Viewport } from "next";
import type { ReactNode } from "react";
import type { Lang } from "../i18n/t";
import "../app/site.css";

// E9g B (D-377): the <html> of both languages (two root layouts: (en) and (bg)/bg). No script, cookie or request to
// anyone but this site; the theme follows the system.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#10161a" },
    { media: "(prefers-color-scheme: light)", color: "#f3f6f7" },
  ],
};

export function SiteHtml({ lang, children }: { lang: Lang; children: ReactNode }) {
  return (
    <html lang={lang} data-theme="system">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
