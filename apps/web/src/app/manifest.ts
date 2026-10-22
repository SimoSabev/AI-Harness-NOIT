import type { MetadataRoute } from "next";
import { getLang } from "../i18n/server";
import { translate } from "../i18n/t";
import { HARNESS } from "../lib/brand";

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
    background_color: "#f7f7f5",
    theme_color: "#1f5fd1",
    lang,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
