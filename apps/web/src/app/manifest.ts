import type { MetadataRoute } from "next";
import { HARNESS } from "../lib/brand";

// Демо промпт т. 8.4 [Ф, Next.js metadata/manifest.mdx]: installable PWA; the phone = inbox + card + diff (Ф4).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: HARNESS,
    short_name: HARNESS,
    description: "Задачи на AI агенти с присъда от системи, до които агентът няма достъп.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#1f5fd1",
    lang: "bg",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
