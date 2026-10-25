import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { EMAIL, login } from "./fixtures";

// E9g A3 (AC-12.6, D-373): local access in the web half. The desktop bridge is faked here (window.harnessDesktop with the
// same methods); the real one, with the native dialog and the checks in main, is in apps/desktop (unit + smoke).
// In a browser (no bridge) none of it shows.
type FakeGrant = { path: string; scopes: string[]; granted_at: string };
async function fakeBridge(page: Page, initial: FakeGrant[] = []): Promise<void> {
  await page.addInitScript((start: FakeGrant[]) => {
    const w = window as unknown as Record<string, unknown>;
    const calls: { m: string; p: unknown }[] = [];
    let grants: FakeGrant[] = start;
    const ok = (value: unknown) => Promise.resolve({ ok: true, value });
    // E9g A4: the host terminal — main would run the shell; here it echoes and reports each typed line
    const listeners: ((c: unknown) => void)[] = [];
    const emit = (c: unknown) => setTimeout(() => listeners.forEach((l) => l(c)), 0);
    let typed = "";
    const api: Record<string, unknown> = {
      version: 1,
      onCommand: (cb: (c: unknown) => void) => (listeners.push(cb), () => void listeners.splice(listeners.indexOf(cb), 1)),
      terminalOpen: (p: unknown) => (calls.push({ m: "terminalOpen", p }), emit({ command: "terminal_output", id: "term_00000000000000aa", data: "fake-shell$ " }), ok({ id: "term_00000000000000aa" })),
      terminalWrite: (p: { id: string; data: string }) => {
        calls.push({ m: "terminalWrite", p });
        for (const ch of p.data) {
          if (ch === "\r") {
            emit({ command: "terminal_line", id: p.id, task_id: "t_seed_bugfix", line: typed });
            emit({ command: "terminal_output", id: p.id, data: `\r\nran: ${typed}\r\nfake-shell$ ` });
            typed = "";
          } else {
            typed += ch;
            emit({ command: "terminal_output", id: p.id, data: ch });
          }
        }
        return ok({});
      },
      terminalResize: (p: unknown) => (calls.push({ m: "terminalResize", p }), ok({})),
      terminalClose: (p: unknown) => (calls.push({ m: "terminalClose", p }), ok({})),
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
  }, initial);
}
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: { m: string; p: unknown }[] }).__calls);

test("browser: no bridge → Local access is not in Settings; Add project takes a typed path (D-388)", async ({ page }) => {
  await login(page, EMAIL.owner);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Local access" })).toHaveCount(0);
  await page.goto("/projects/add");
  await page.getByLabel("Full path of the project folder").fill("/Users/simo/shop");
  await page.getByRole("button", { name: "Add the project" }).click();
  // the e2e server runs without `mandat local`, so there is nothing to register with — the page says so
  await expect(page.getByText("This works only while the app runs on this computer.")).toBeVisible();
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

// E9g A4 (AC-12.8, D-375): the host terminal on a task — labelled "not the sandbox", only with the terminal scope, each
// typed line goes to the task's activity (POST local-activity), closing the panel closes the shell.
test("desktop: host terminal on a task — not the sandbox, terminal scope only, typed lines to the task activity", async ({ page }) => {
  await fakeBridge(page, [{ path: "/Users/simo/code/shop", scopes: ["read", "apply"], granted_at: "2026-10-24T02:00:00.000Z" }]);
  await login(page, EMAIL.owner);
  await page.goto("/tasks/t_seed_bugfix");
  await expect(page.getByRole("heading", { name: "On this computer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open terminal" })).toHaveCount(0); // no terminal scope

  await fakeBridge(page, [{ path: "/Users/simo/code/shop", scopes: ["read", "terminal"], granted_at: "2026-10-24T02:00:00.000Z" }]);
  await page.goto("/tasks/t_seed_bugfix");
  await page.getByRole("button", { name: "Open terminal" }).click();
  await expect(page.getByTestId("host-terminal-label")).toContainText("Not the sandbox: commands run on this computer, in /Users/simo/code/shop");
  const region = page.getByRole("region", { name: "Host terminal in /Users/simo/code/shop" });
  await expect(region).toContainText("fake-shell$");
  const open = (await calls(page)).find((c) => c.m === "terminalOpen")?.p as { task_id: string; path: string; cols: number; rows: number };
  expect(open).toMatchObject({ task_id: "t_seed_bugfix", path: "/Users/simo/code/shop" });
  expect(open.cols).toBeGreaterThan(1);

  const logged = page.waitForRequest((r) => r.url().endsWith("/api/tasks/t_seed_bugfix/local-activity") && (r.postData() ?? "").includes("echo hi"));
  await region.click();
  await page.keyboard.type("echo hi");
  await page.keyboard.press("Enter");
  expect(JSON.parse((await logged).postData() ?? "{}")).toEqual({ kind: "local_terminal", outcome: "command", detail: "echo hi" });
  await expect(region).toContainText("ran: echo hi");

  await page.getByRole("button", { name: "Close terminal" }).click();
  await expect(region).toHaveCount(0);
  expect((await calls(page)).filter((c) => c.m === "terminalClose")).toEqual([{ m: "terminalClose", p: { id: "term_00000000000000aa" } }]);
});

// AC-12.3 for the new screens: axe 0 serious/critical with the bridge present, both themes
for (const scheme of ["dark", "light"] as const) {
  test(`a11y of Add project and Local access in the desktop (${scheme})`, async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "theme", value: scheme, url: baseURL ?? "http://localhost:3000" }]);
    await fakeBridge(page, [{ path: "/Users/simo/code/shop", scopes: ["read", "terminal"], granted_at: "2026-10-24T02:00:00.000Z" }]);
    await login(page, EMAIL.owner);
    const axe = async (what: string) => {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${what}: ${v.id} (${v.nodes.length})`)).toEqual([]);
    };
    for (const url of ["/projects/add?path=%2FUsers%2Fsimo%2Fcode%2Fshop", "/settings/local", "/settings", "/tasks/t_seed_bugfix"]) {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await axe(url);
    }
    // E9g A4: the open host terminal panel too
    await page.getByRole("button", { name: "Open terminal" }).click();
    await expect(page.getByTestId("host-terminal-label")).toBeVisible();
    await axe("host terminal");
  });
}
