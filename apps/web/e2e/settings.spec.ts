import { expect, test } from "@playwright/test";
import { EMAIL, login } from "./fixtures";

// D-305: the theme is chosen in Настройки, applies at once and stays after a reload; the view switch on the start page.
test("тема: тъмна по подразбиране → светла от Настройки → остава след презареждане", async ({ page }) => {
  await login(page, EMAIL.approver);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Светла" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("radio", { name: "Светла" })).toBeChecked();
});

test("изгледи на главната: карта, колони, проект, списък", async ({ page }) => {
  await login(page, EMAIL.approver);
  await expect(page.getByRole("list", { name: "Къде са задачите" })).toBeVisible();
  await page.getByRole("button", { name: "Карта + колони" }).click();
  await expect(page.getByRole("button", { name: "Карта + колони" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Проект", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Проекти" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ритъм · 7 дни", exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Списък" }).click();
  await expect(page.getByRole("heading", { name: /В работа|Готово|Чака теб/ }).first()).toBeVisible();
});
