import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { EMAIL, login } from "./fixtures";

// D-292: axe → 0 serious/critical on every page of the minimal UI (light and dark).
for (const scheme of ["light", "dark"] as const) {
  test(`a11y (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, EMAIL.approver);
    for (const url of ["/", "/tasks/new", "/tasks/t_seed_failed", "/tasks/t_seed_bugfix", "/login"]) {
      await page.goto(url);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${url}: ${v.id} (${v.nodes.length})`);
      expect(bad).toEqual([]);
    }
  });
}
