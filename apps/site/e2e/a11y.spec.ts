import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { DOC_SLUGS } from "../src/lib/docs";

// E9g B step 7 (D-378): axe → 0 serious/critical on every page of the site, in the dark and the light theme (the site
// follows the system theme), in English and Bulgarian, and no horizontal scroll at phone width.
const EN = ["/", "/download/", "/docs/", ...DOC_SLUGS.map((s) => `/docs/${s}/`)];
const PAGES = [...EN, ...EN.map((p) => `/bg${p}`)];

for (const scheme of ["dark", "light"] as const) {
  test(`a11y (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const bad: string[] = [];
    for (const url of PAGES) {
      await page.goto(url);
      await expect(page.locator("h1")).toHaveCount(1);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      bad.push(...r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${url}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(" ") ?? ""}`));
    }
    expect(bad).toEqual([]);
  });
}

test("phone width: no horizontal page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const wide: string[] = [];
  for (const url of PAGES) {
    await page.goto(url);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    if (w > 375) wide.push(`${url}: ${w}`);
  }
  expect(wide).toEqual([]);
});

test("the light screenshot is used in the light theme, the dark one otherwise", async ({ page }) => {
  for (const scheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/docs/verdicts/");
    const img = page.locator("figure picture img").first();
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.currentSrc)).toContain(`task-failed-en-${scheme}.png`);
  }
});
