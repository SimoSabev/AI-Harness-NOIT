import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { EMAIL, login } from "./fixtures";

// E9g A3 (AC-12.6, D-373): local access in the web half. The desktop bridge is faked here (window.harnessDesktop with the
// same methods); the real one, with the native dialog and the checks in main, is in apps/desktop (unit + smoke).
// In a browser (no bridge) none of it shows.
async function fakeBridge(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const calls: { m: string; p: unknown }[] = [];
    let grants: { path: string; scopes: string[]; granted_at: string }[] = [];
    const ok = (value: unknown) => Promise.resolve({ ok: true, value });
    const api: Record<string, unknown> = {
      version: 1,
      onCommand: () => () => undefined,
      pickFolder: (p: unknown) => (calls.push({ m: "pickFolder", p }), ok({ path: "/Users/simo/code/picked" })),
      grantsList: (p: unknown) => (calls.push({ m: "grantsList", p }), ok({ grants })),
      grant: (p: { path: string; scopes: string[] }) => {
        calls.push({ m: "grant", p });
        const g = { path: p.path, scopes: p.scopes, granted_at: "2026-10-24T02:00:00.000Z" };
        grants = [...grants.filter((x) => x.path !== p.path), g];
        return ok({ grant: g });
      },
      revoke: (p: { path: string; scopes?: string[] }) => {
        calls.push({ m: "revoke", p });
        grants = grants.flatMap((g) => (g.path !== p.path ? [g] : p.scopes ? (g.scopes.filter((s) => !p.scopes?.includes(s)).length ? [{ ...g, scopes: g.scopes.filter((s) => !p.scopes?.includes(s)) }] : []) : []));
        return ok({ grants });
      },
      openInEditor: (p: unknown) => (calls.push({ m: "openInEditor", p }), ok({})),
      applyLocal: (p: unknown) => (calls.push({ m: "applyLocal", p }), ok({ status: "applied", head: "a".repeat(40) })),
      notify: () => ok({}),
      badge: () => ok({}),
      inboxCount: () => ok({}),
    };
    w.harnessDesktop = Object.freeze(api);
    w.__calls = calls;
  });
}
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: { m: string; p: unknown }[] }).__calls);

test("browser: no bridge → Local access is not in Settings and Add project says desktop only", async ({ page }) => {
  await login(page, EMAIL.owner);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Local access" })).toHaveCount(0);
  await page.goto("/projects/add?path=%2FUsers%2Fsimo%2Fshop");
  await expect(page.getByText("This works only in the desktop app.")).toBeVisible();
});

test("desktop: a dropped folder → Add project with the suggestion → grant → listed in Local access → revoke", async ({ page }) => {
  await fakeBridge(page);
  await login(page, EMAIL.owner);
  await page.goto("/projects/add?path=%2FUsers%2Fsimo%2Fcode%2Fshop");
  await expect(page.getByRole("heading", { name: "Add project", level: 1 })).toBeVisible();
  await expect(page.locator("#main").getByText("shop", { exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^Read/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /^Apply locally/ })).not.toBeChecked();
  await page.getByRole("checkbox", { name: /^Apply locally/ }).check();
  await page.getByRole("button", { name: "Grant access" }).click();
  await expect(page.getByText("Granted: /Users/simo/code/shop")).toBeVisible();
  expect((await calls(page)).find((c) => c.m === "grant")?.p).toEqual({ path: "/Users/simo/code/shop", scopes: ["read", "apply"] });

  await page.goto("/settings");
  await page.getByRole("link", { name: "Open Local access" }).click();
  await expect(page.getByRole("heading", { name: "Local access", level: 1 })).toBeVisible();
  // a full reload loses the fake bridge's memory; the list comes from grantsList, so grant again through the page
  await page.goto("/projects/add");
  await page.getByRole("button", { name: "Choose a folder…" }).click();
  await page.getByRole("button", { name: "Grant access" }).click();
  await expect(page.getByText("Granted: /Users/simo/code/picked")).toBeVisible();
  await page.getByRole("link", { name: /Settings/ }).first().click();
  await page.getByRole("link", { name: "Open Local access" }).click();
  await expect(page.getByText("/Users/simo/code/picked")).toBeVisible();
  await page.getByRole("button", { name: "Forget /Users/simo/code/picked" }).click();
  await expect(page.getByText("No folder is granted yet.")).toBeVisible();
});

// AC-12.3 for the new screens: axe 0 serious/critical with the bridge present, both themes
for (const scheme of ["dark", "light"] as const) {
  test(`a11y of Add project and Local access in the desktop (${scheme})`, async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "theme", value: scheme, url: baseURL ?? "http://localhost:3000" }]);
    await fakeBridge(page);
    await login(page, EMAIL.owner);
    for (const url of ["/projects/add?path=%2FUsers%2Fsimo%2Fcode%2Fshop", "/settings/local", "/settings", "/tasks/t_seed_bugfix"]) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${url}: ${v.id} (${v.nodes.length})`)).toEqual([]);
    }
  });
}
