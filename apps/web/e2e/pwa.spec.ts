import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { EMAIL, login } from "./fixtures";

// Демо промпт т. 8.4 „Готово, когато“: manifest installable (Chromium CDP Page.getInstallabilityErrors) + e2e mobile.
test("PWA: manifest + service worker → без грешки за инсталиране (постоянен профил, не incognito)", async ({ baseURL }) => {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(path.join(os.tmpdir(), "mandat-pwa-")), { executablePath: process.env.MANDAT_CHROMIUM ?? "/opt/pw-browsers/chromium", baseURL: baseURL as string });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await login(page, EMAIL.viewer);
    const m = (await (await page.request.get("/manifest.webmanifest")).json()) as { name: string; display: string; start_url: string; icons: { sizes: string }[] };
    expect([m.name, m.display, m.start_url]).toEqual(["Мандат", "standalone", "/"]);
    expect(m.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    await page.waitForFunction(async () => Boolean(await navigator.serviceWorker.getRegistration()), null, { timeout: 15_000 });
    const cdp = await ctx.newCDPSession(page);
    const r = (await cdp.send("Page.getInstallabilityErrors")) as { installabilityErrors: { errorId: string }[] };
    expect(r.installabilityErrors.map((e) => e.errorId)).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test.describe("mobile (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("inbox → карта → одобри; цели ≥ 44 px; дъската е с табове", async ({ page }) => {
    await login(page, EMAIL.approver);
    const card = page.locator("article", { hasText: "Мобилна карта" });
    await card.getByRole("link").first().click();
    await page.waitForURL("**/tasks/t_seed_mobile");
    await page.goto("/tasks/t_seed_mobile?tab=diff");
    await expect(page.locator("pre.diff")).toBeVisible();
    const approve = page.locator("main article").getByRole("button", { name: "Одобри" });
    const box = await approve.boundingBox();
    expect(box && box.height >= 44 && box.width >= 44).toBe(true);
    await approve.click();
    await page.locator("form.confirm").getByRole("button", { name: "Одобри" }).click();
    await expect(page.locator("main article").getByRole("button", { name: "Одобри" })).toHaveCount(0);
    for (const b of await page.locator("header.top nav a, .btn").all()) {
      const bb = await b.boundingBox();
      if (bb && (await b.isVisible())) expect(bb.height).toBeGreaterThanOrEqual(44);
    }
    await page.goto("/board");
    await expect(page.locator(".board-tabs a")).toHaveCount(7);
  });
});
