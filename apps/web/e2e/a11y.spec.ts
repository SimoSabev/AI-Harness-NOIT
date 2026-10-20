import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { EMAIL, login } from "./fixtures";

// Демо промпт т. 8.1: axe → 0 serious/critical на /, /board, /tasks/[id] (светла и тъмна тема).
for (const scheme of ["light", "dark"] as const) {
  test(`a11y (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, EMAIL.approver);
    for (const url of ["/", "/board", "/tasks/t_seed_failed", "/tasks/t_seed_failed?tab=ledger", "/harness", "/login"]) {
      await page.goto(url);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${url}: ${v.id} (${v.nodes.length})`);
      expect(bad).toEqual([]);
    }
  });
}
