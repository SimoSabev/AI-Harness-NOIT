import type { Metadata } from "next";
import { Frame } from "../components/frame";
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
        <h1 className="font-display text-3xl font-semibold tracking-wide">404</h1>
        <p className="mt-4 text-mute">
          <a className="text-accent-text underline-offset-4 hover:underline" href={pagePath("en", "/")}>{t("nav.home")}</a>
        </p>
      </Frame>
    </SiteHtml>
  );
}
