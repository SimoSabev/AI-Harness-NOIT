// D-296: the harness (the whole app) has no name yet (Симо, 21.10.2026: blank everywhere); Мандат is only the judge
// (verdict D1–D4, the ladder, the ledger). When the harness gets a name, set HARNESS and every title and the logo follow.
export const HARNESS = "";
export const JUDGE = "Мандат";

export function pageName(page: string): string {
  return HARNESS ? `${page} · ${HARNESS}` : page;
}
