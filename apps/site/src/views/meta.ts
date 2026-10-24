import type { Metadata } from "next";
import { LANGS, pagePath, translator } from "../i18n/t";
import type { Lang, PagePath } from "../i18n/t";

// E9g B (D-377): title, description and the other language of a page.
export function pageMetadata(lang: Lang, page: PagePath): Metadata {
  const t = translator(lang);
  const name = t("brand.name");
  return {
    title: page === "/" ? name : `${t("meta.download")} · ${name}`,
    description: t("meta.description"),
    icons: { icon: "/icon-192.png" },
    alternates: { languages: Object.fromEntries(LANGS.map((l) => [l, pagePath(l, page)])) },
  };
}
