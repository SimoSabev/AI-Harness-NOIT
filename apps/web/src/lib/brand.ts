// D-296: the harness (the whole app) has no name yet (Simo, 21.10.2026: blank everywhere); Mandat is only the judge
// (verdict D1–D4, the ladder, the ledger). When the harness gets a name, set HARNESS and every title and the logo follow.
// The judge's name on screen comes from the catalog (brand.judge, E7f).
export const HARNESS = "";
export const JUDGE = "Mandat";

export function pageName(page: string): string {
  return HARNESS ? `${page} · ${HARNESS}` : page;
}
