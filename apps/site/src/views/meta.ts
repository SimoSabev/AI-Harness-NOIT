import type { Metadata } from "next";
import { LANGS, pagePath, translator } from "../i18n/t";
import type { Key, Lang, PagePath } from "../i18n/t";

// D-383: the logo close up for the tab; the app icon as the larger size.
export const SITE_ICONS: Metadata["icons"] = { icon: [{ url: "/logo.png", type: "image/png" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }] };

// E9g B (D-377, step 7 D-378): title, description and the other language of a page.
export function pageMetadata(lang: Lang, page: PagePath, title?: Key): Metadata {
  const t = translator(lang);
  const name = t("brand.name");
  const head = page === "/" ? name : page === "/download/" ? `${t("meta.download")} · ${name}` : title ? `${t(title)} · ${t("meta.docs")} · ${name}` : `${t("meta.docs")} · ${name}`;
  return {
    title: head,
    description: t("meta.description"),
    icons: SITE_ICONS,
    alternates: { languages: Object.fromEntries(LANGS.map((l) => [l, pagePath(l, page)])) },
  };
}
