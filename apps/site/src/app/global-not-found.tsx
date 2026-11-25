import type { Metadata } from "next";
import { Frame } from "../components/frame";
import { btn } from "../components/ui";
import { SiteHtml } from "../components/site-html";
import { pagePath, translator } from "../i18n/t";
import { SITE_ICONS } from "../views/meta";

// E9g B (D-377): the 404 of the export (two root layouts, so it brings its own <html lang>). English, with the way home.
export const metadata: Metadata = { title: "404", robots: { index: false }, icons: SITE_ICONS };

export default function GlobalNotFound() {
  const t = translator("en");
  return (
    <SiteHtml lang="en">
      <Frame lang="en" page="/">
        {/* D-608: the mark, the code large, the way home as a button */}
        <div className="flex flex-col items-center py-16 text-center">
          <span aria-hidden="true" className="logo-mark block size-12" />
          <h1 className="mt-6 text-6xl font-semibold tracking-[-0.04em]">404</h1>
          <a className={`${btn.secondary} mt-8`} href={pagePath("en", "/")}>{t("nav.home")}</a>
        </div>
      </Frame>
    </SiteHtml>
  );
}
