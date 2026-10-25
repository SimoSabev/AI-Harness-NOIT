import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { EMAIL, login } from "./fixtures";

// D-292 / D-305 / E7е: axe → 0 serious/critical on every page, in the dark and the light theme (the theme is a cookie),
// in English (the default) and in Bulgarian (cookie lang=bg).
for (const [scheme, lang] of [["light", "en"], ["dark", "en"], ["light", "bg"], ["dark", "bg"]] as const) {
  test(`a11y (${scheme}, ${lang})`, async ({ page, context, baseURL }) => {
    test.setTimeout(120_000);
    await context.addCookies([{ name: "theme", value: scheme, url: baseURL ?? "http://localhost:3000" }, { name: "lang", value: lang, url: baseURL ?? "http://localhost:3000" }]);
    await page.emulateMedia({ colorScheme: scheme });
    await login(page, EMAIL.approver);
    for (const url of ["/", "/board", "/harness", "/tasks/new", "/tasks/t_seed_failed", "/tasks/t_seed_bugfix", "/keys", "/settings", "/?project=mandat-demo%2Fshop", "/agents", "/tools", "/night", "/research", "/system", "/login"]) {
      await page.goto(url);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${url}: ${v.id} (${v.nodes.length})`);
      expect(bad).toEqual([]);
    }
  });
}
