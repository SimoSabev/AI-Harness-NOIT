// D-296: the harness (the whole app) has no name yet (Simo, 21.10.2026: blank everywhere); Mandat is only the judge
// (verdict D1–D4, the ladder, the ledger). When the harness gets a name, set HARNESS and every title and the logo follow.
// The judge's name on screen comes from the catalog (brand.judge, E7f).
export const HARNESS = "";
export const JUDGE = "Mandat";

export function pageName(page: string): string {
  return HARNESS ? `${page} · ${HARNESS}` : page;
}

// D-382: the installed app (PWA) and the browser tab: the dark canvas of tokens.css and the logo icons, which
// scripts/brand-icons.mjs draws into public/.
export const APP_COLOR = "#0c0f0d";
export const APP_ICONS: { src: string; sizes: string; type: string; purpose?: "maskable" }[] = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
  { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];
export const FAVICON = { url: "/favicon.svg", type: "image/svg+xml" };
