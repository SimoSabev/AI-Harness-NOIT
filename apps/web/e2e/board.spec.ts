import { expect, test } from "@playwright/test";
import { EMAIL, login } from "./fixtures";

// т. 8.1 / D-298: дъската със 7 колони; картата показва тестовете и стълбата; задачата — „Защо да вярваш“.
test("дъска: 7 колони и стълбата на картата", async ({ page }) => {
  await login(page, EMAIL.viewer);
  await page.goto("/board");
  await expect(page.getByRole("heading", { name: "Дъска", level: 1 })).toBeVisible();
  for (const t of ["Нови", "Работи", "Проверява", "Чака теб", "Блокирано / Провал", "Доставено", "Резултат"]) {
    await expect(page.getByRole("heading", { name: new RegExp(`^${t.replace("/", "\\/")}`), level: 2 })).toBeVisible();
  }
  await expect(page.getByText("ниво 1, още").first()).toBeVisible();
  await expect(page.getByText("A 20/20 · B 19/20 (20 → 19)").first()).toBeVisible();
});

test("задача: тестове преди → след, стълба, дневник", async ({ page }) => {
  await login(page, EMAIL.viewer);
  await page.goto("/tasks/t_seed_failed");
  const trust = page.locator("section", { has: page.getByRole("heading", { name: "Защо да вярваш на резултата" }) });
  await expect(trust.getByText("A 20/20 · B 19/20 (20 → 19)")).toBeVisible();
  await expect(trust.getByText(/ниво 0/)).toBeVisible();
});
