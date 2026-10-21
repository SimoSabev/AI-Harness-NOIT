// D-296: the harness (the whole app) is Хамут; Мандат is only the judge (verdict D1–D4, the ladder, the ledger).
export const HARNESS = "Хамут";
export const JUDGE = "Мандат";

export function pageName(page: string): string {
  return `${page} · ${HARNESS}`;
}
