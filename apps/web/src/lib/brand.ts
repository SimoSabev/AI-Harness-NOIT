// D-296: the name of the whole app; Mandat is only the judge's internal name (verdict D1–D4, the ladder, the ledger).
// D-596 (Simo 24.11.2026): the product is Harnova (its voice is Nova); every title and the installed app follow this.
// The judge's name on screen comes from the catalog (brand.judge, E7f).
export const HARNESS = "Harnova";
export const JUDGE = "Mandat";

export function pageName(page: string): string {
  return HARNESS ? `${page} · ${HARNESS}` : page;
}

// D-382, D-383: the installed app (PWA) and the browser tab: the dark canvas of tokens.css and the logo icons, which
// scripts/brand-icons.mjs cuts from the chosen image into public/.
export const APP_COLOR = "#0c0f0d";
export const APP_ICONS: { src: string; sizes: string; type: string; purpose?: "maskable" }[] = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
  { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
];
export const FAVICON = { url: "/logo.png", type: "image/png" };
