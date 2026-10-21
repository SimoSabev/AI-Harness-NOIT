import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { EMAIL, login } from "./fixtures";

// D-292 / D-305: axe → 0 serious/critical on every page, in the dark and the light theme (the theme is a cookie).
for (const scheme of ["light", "dark"] as const) {
  test(`a11y (${scheme})`, async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "theme", value: scheme, url: baseURL ?? "http://localhost:3000" }]);
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, EMAIL.approver);
    for (const url of ["/", "/board", "/harness", "/tasks/new", "/tasks/t_seed_failed", "/tasks/t_seed_bugfix", "/keys", "/settings", "/?project=mandat-demo%2Fshop", "/login"]) {
      await page.goto(url);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${url}: ${v.id} (${v.nodes.length})`);
      expect(bad).toEqual([]);
    }
  });
}
