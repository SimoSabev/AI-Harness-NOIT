import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";

// E9g A5 (D-376): AC-12.5 / AC-12.6 / AC-12.7 in a real Electron window — start → inbox, menu → new task,
// a dropped folder → "Add project", an action without a grant is refused. The harness is the fake one (no Docker).
const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");

let app: ElectronApplication;
let page: Page;
let home: string;
let work: string;

test.beforeAll(async () => {
  home = realpathSync(mkdtempSync(path.join(os.tmpdir(), "mandat-e2e-home-")));
  work = realpathSync(mkdtempSync(path.join(os.tmpdir(), "mandat-e2e-work-")));
  writeFileSync(path.join(work, "README.md"), "# demo\n");
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== "ANTHROPIC_API_KEY" && k !== "OPENAI_API_KEY") env[k] = v;
  app = await electron.launch({
    args: [appDir],
    env: { ...env, MANDAT_DESKTOP_FAKE_HARNESS: path.join(here, "fake-harness.mjs"), MANDAT_HOME: home, MANDAT_LANG: "en" },
  });
  page = await app.firstWindow();
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\/$/, { timeout: 30_000 });
});

test.afterAll(async () => {
  await app?.close();
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
});

test("start → the inbox opens, and main reads its waiting count", async () => {
  await expect(page.locator("#title")).toHaveText("Inbox");
  const origin = new URL(page.url()).origin;
  await expect.poll(async () => ((await (await fetch(`${origin}/__hits`)).json()) as { inbox: number }).inbox, { timeout: 20_000 }).toBeGreaterThan(0);
  if (process.platform === "darwin") await expect.poll(() => app.evaluate(({ app: a }) => a.getBadgeCount())).toBe(2);
});

test("the bridge is the only way in: no require/process in the page, the method list is exposed", async () => {
  const r = await page.evaluate(() => ({ require: typeof (window as unknown as { require?: unknown }).require, process: typeof (window as unknown as { process?: unknown }).process, bridge: typeof (window as unknown as { harnessDesktop?: unknown }).harnessDesktop }));
  expect(r).toEqual({ require: "undefined", process: "undefined", bridge: "object" });
});

test("an action without a grant is refused (apply locally, terminal)", async () => {
  const r = await page.evaluate(async (p) => {
    const b = (window as unknown as { harnessDesktop: Record<string, (x: unknown) => Promise<unknown>> }).harnessDesktop;
    return { apply: await b.applyLocal!({ task_id: "t_e2e_discount", path: p }), term: await b.terminalOpen!({ task_id: "t_e2e_discount", path: p, cols: 80, rows: 24 }) };
  }, work);
  expect(r.apply).toMatchObject({ ok: false, error: { code: "not_granted" } });
  expect(r.term).toMatchObject({ ok: false, error: { code: "not_granted" } });
});

test("menu File → New task → the new task page", async () => {
  await app.evaluate(({ Menu }) => {
    const walk = (items: Electron.MenuItem[]): Electron.MenuItem | null => {
      for (const i of items) {
        if (i.label === "New task") return i;
        const sub = i.submenu ? walk(i.submenu.items) : null;
        if (sub) return sub;
      }
      return null;
    };
    const item = walk(Menu.getApplicationMenu()?.items ?? []);
    if (!item) throw new Error("no New task item");
    item.click();
  });
  await expect(page.locator("#title")).toHaveText("New task");
  expect(new URL(page.url()).pathname).toBe("/tasks/new");
});

test("a file dropped on the window → the Add project screen with its path (nothing granted)", async () => {
  const file = path.join(work, "README.md");
  await page.setInputFiles("#f", file);
  await page.evaluate(() => {
    const input = document.getElementById("f") as HTMLInputElement;
    const dt = new DataTransfer();
    if (input.files?.[0]) dt.items.add(input.files[0]);
    document.body.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    document.body.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await expect(page.locator("#title")).toHaveText("Add project");
  await expect(page.locator("#path")).toHaveText(file);
  const grants = await page.evaluate(() => (window as unknown as { harnessDesktop: { grantsList(x: unknown): Promise<unknown> } }).harnessDesktop.grantsList({}));
  expect(grants).toEqual({ ok: true, value: { grants: [] } });
});
