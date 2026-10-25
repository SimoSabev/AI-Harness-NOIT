import { expect, test } from "@playwright/test";
import { EMAIL, login } from "./fixtures";

// Demo prompt §8.1 / D-298: the board with 7 columns; a card shows the tests and the ladder; the task — “Why trust”.
test("board: 7 columns and the ladder on the card", async ({ page }) => {
  await login(page, EMAIL.viewer);
  await page.goto("/board");
  await expect(page.getByRole("heading", { name: "Board", level: 1 })).toBeVisible();
  for (const t of ["New", "Working", "Checking", "Waiting for you", "Blocked / Failed", "Delivered", "Outcome"]) {
    await expect(page.getByRole("heading", { name: new RegExp(`^${t.replace("/", "\\/")}`), level: 2 })).toBeVisible();
  }
  await expect(page.getByText(/level 1, \d+ more VERIFIED/).first()).toBeVisible();
  await expect(page.getByText("A 20/20 · B 19/20 (20 → 19)").first()).toBeVisible();
});

test("task: tests before → after, ladder, ledger", async ({ page }) => {
  await login(page, EMAIL.viewer);
  await page.goto("/tasks/t_seed_failed");
  const trust = page.locator("section", { has: page.getByRole("heading", { name: "Why trust the result" }) });
  await expect(trust.getByText("A 20/20 · B 19/20 (20 → 19)")).toBeVisible();
  await expect(trust.getByText(/level 0/)).toBeVisible();
});
