import type { MetadataRoute } from "next";
import { getLang } from "../i18n/server";
import { translate } from "../i18n/t";
import { APP_COLOR, APP_ICONS, HARNESS } from "../lib/brand";

// Demo prompt §8.4 [fact, Next.js metadata/manifest.mdx]: installable PWA; the phone = inbox + card + diff (F4).
// E7f: the names follow the language of the request (cookie `lang`, Accept-Language, English).
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const lang = await getLang();
  return {
    name: HARNESS || translate(lang, "manifest.name"),
    short_name: HARNESS || translate(lang, "manifest.short"),
    description: translate(lang, "manifest.description"),
    start_url: "/",
    display: "standalone",
    background_color: APP_COLOR,
    theme_color: APP_COLOR,
    lang,
    icons: APP_ICONS,
  };
}
