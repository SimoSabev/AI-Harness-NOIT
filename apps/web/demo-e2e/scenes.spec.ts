import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { EMAIL, TOTP, login, totpNow } from "../e2e/fixtures";

// Демо промпт т. 9: demo-scene1/2/3 (offline UI): the expected texts; scene 1 starts at level 1.
const shots = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../demo/screenshots");
const shot = (page: import("@playwright/test").Page, name: string) => page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
test.describe.configure({ mode: "serial" });

test("сцена 1: карта ✔ ПРОВЕРЕНО · ниво 1, още 1 ПРОВЕРЕНО до ниво 2 → Одобри + TOTP", async ({ page }) => {
  await login(page, EMAIL.approver);
  await expect(page.locator(".summary")).toContainText("ПРОВЕРЕНО и слети сами");
  const card = page.locator("article", { hasText: "Поправи закръглянето на ДДС" });
  await expect(card.getByText("ниво 1, още 1 ПРОВЕРЕНО до ниво 2")).toBeVisible();
  await expect(card.locator(".verdict")).toContainText("ПРОВЕРЕНО");
  await shot(page, "scene1-inbox");
  const feature = page.locator("article", { hasText: "SAVE10" });
  await feature.getByRole("button", { name: "Одобри" }).click();
  await feature.getByLabel("Код от приложението (6 цифри)").fill(totpNow(TOTP));
  await shot(page, "scene1-totp");
  await feature.getByRole("button", { name: "Одобри" }).last().click();
  await expect(page.locator("article", { hasText: "SAVE10" })).toHaveCount(0);
  await page.goto("/tasks/t_seed_css?tab=ladder");
  await expect(page.locator("#tab-h + p.level")).toHaveText("ниво 3 (закрепено)");
  await shot(page, "scene1-ladder");
});

test("сцена 2: „anthropic-key-demo: лимит, нулира се в HH:MM“ → Codex · опит 2 · ниво 0 → клон …-a2", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/channels");
  const row = page.getByRole("row", { name: /anthropic-key-demo/ });
  await expect(row).toContainText("✖ лимит");
  await expect(row).toContainText(/нулира се в \d\d:\d\d/);
  await shot(page, "scene2-channels");
  await page.goto("/tasks/t_scene2");
  await expect(page.locator("main article").first()).toContainText("codex");
  await expect(page.locator("main article").first()).toContainText("ниво 0");
  await shot(page, "scene2-card");
});

test("сцена 3: ✖ ПРОВАЛ · D2 (изтрит тест) · Слой: агент · A 20/20 · B 19/20 (20 → 19)", async ({ page }) => {
  await login(page, EMAIL.viewer);
  await page.goto("/tasks/t_seed_failed");
  const card = page.locator("main article").first();
  await expect(card.locator(".verdict")).toContainText("ПРОВАЛ");
  await expect(card).toContainText("съществува на base и липсва");
  await expect(card).toContainText("A 20/20 · B 19/20 (20 → 19)");
  await expect(card).toContainText("Слой: агент");
  await shot(page, "scene3-card");
  await page.goto("/board");
  await shot(page, "scene3-board");
});
