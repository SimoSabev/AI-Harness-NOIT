import { expect, test } from "@playwright/test";
import { EMAIL, login } from "./fixtures";

// D-305: the theme is chosen in Settings, applies at once and stays after a reload; the view switch on the overview.
test("theme: dark by default → light from Settings → stays after a reload", async ({ page }) => {
  await login(page, EMAIL.approver);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Light" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("radio", { name: "Light" })).toBeChecked();
});

test("overview views: map, columns, project, list", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/overview");
  await expect(page.getByRole("list", { name: "Where the tasks are" })).toBeVisible();
  await page.getByRole("button", { name: "Map + columns" }).click();
  await expect(page.getByRole("button", { name: "Map + columns" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Project", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Projects" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rhythm · 7 days", exact: false })).toBeVisible();
  await page.getByRole("button", { name: "List" }).click();
  await expect(page.getByRole("heading", { name: /In progress|Done|Waiting for you/ }).first()).toBeVisible();
});

// E7е: the language is a cookie set in Settings; English by default, Bulgarian on choice; <html lang> follows it.
test("language: English by default → Bulgarian from Settings → stays after a reload → back to English", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/settings");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("radio", { name: "Български" }).check();
  await expect(page.getByRole("heading", { name: "Настройки", level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "bg");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Български" })).toBeChecked();
  await page.getByRole("radio", { name: "English" }).check();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

// E8c (AC-8.3, AC-8.7): roles are data — the owner creates a scoped "docs reviewer"; an approver may not see the page.
test("roles: owner creates a docs reviewer role; an approver has no access", async ({ page }) => {
  await login(page, EMAIL.owner);
  await page.goto("/settings/roles");
  await expect(page.getByRole("heading", { level: 1, name: "Roles" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Roles" }).getByText("agent-operator")).toBeVisible();
  await page.getByLabel("Name").fill("docs reviewer");
  for (const c of ["approve.level1", "approve.level2", "diff.view"]) await page.getByRole("checkbox", { name: c, exact: true }).check();
  await page.getByRole("checkbox", { name: "docs", exact: true }).check();
  await page.getByLabel("Highest level it may approve").selectOption("2");
  await page.getByRole("button", { name: "Create role" }).click();
  await expect(page.getByRole("status")).toHaveText("Role created.");
  await expect(page.getByRole("list", { name: "Roles" }).getByText("task types: docs · up to level 2")).toBeVisible();
  await login(page, EMAIL.approver);
  await page.goto("/settings/roles");
  await expect(page.getByRole("note")).toHaveText("Only someone who manages roles or members can see this page.");
});
