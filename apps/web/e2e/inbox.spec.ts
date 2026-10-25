import { expect, test } from "@playwright/test";
import { EMAIL, TOTP, login, totpNow } from "./fixtures";

// D-292: the minimal harness — list → task → decision; a new task from the form. English is the default (E7е).
test.describe.configure({ mode: "serial" });

test("viewer: the list — “Waiting for you” with 4 tasks, the counter in the title, the reason of the failure", async ({ page }) => {
  await login(page, EMAIL.viewer);
  await page.goto("/overview");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible();
  const waiting = page.locator("section", { has: page.getByRole("heading", { name: /Waiting for you/ }) });
  await expect(waiting.locator("li")).toHaveCount(4);
  await expect(page).toHaveTitle("4 waiting");
  await expect(waiting.getByText("exists on base and is missing").first()).toBeVisible();
});

test("viewer: the task without the diff and without decision buttons", async ({ page }) => {
  await login(page, EMAIL.viewer);
  await page.goto("/tasks/t_seed_bugfix");
  await expect(page.getByText("Awaiting approval").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "The agent's change" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve the change" })).toHaveCount(0);
});

test("failed: the reason in plain words and the check that did not pass", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/tasks/t_seed_failed");
  await expect(page.getByText("Mandat rejected the change.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run again" })).toBeVisible();
  await expect(page.getByLabel("A note to the agent (optional)")).toBeVisible();
  await page.getByText("Details: checks, trust, cost, log").click();
  await expect(page.getByText("No test was deleted, skipped or weakened")).toBeVisible();
});

test("approver: approve (confirm) → “Approved”", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/tasks/t_seed_bugfix");
  await expect(page.getByRole("region", { name: "The agent's change" })).toBeVisible();
  await page.getByRole("button", { name: "Approve the change" }).click();
  await expect(page.getByText("Approve this change?")).toBeVisible();
  await page.getByRole("button", { name: "Yes, approve" }).click();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
});

test("approver: level 1 asks for a fresh TOTP code; wrong → a message; right → “Approved”", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/");
  await page.getByRole("link", { name: /SAVE10/ }).click();
  await page.getByRole("button", { name: "Approve the change" }).click();
  const code = page.getByLabel("Code from the app (6 digits)");
  await code.fill(totpNow(TOTP) === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Yes, approve" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "code" })).toHaveText("The code is wrong or has expired.");
  await code.fill(totpNow(TOTP));
  await page.getByRole("button", { name: "Yes, approve" }).click();
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
});

// D-384: one box starts a task; the demo agents show only with MANDAT_DEMO_AGENTS=1 (set for e2e in playwright.config)
test("new task: a demo agent → the task “Queued”", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.getByRole("link", { name: "+ New task" }).click();
  await page.getByLabel("What should the agent do").fill("Fix the discount threshold");
  await page.getByRole("combobox").selectOption({ label: "Demo: deletes a test" });
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/\?task=t_/);
  await expect(page.getByText("Fix the discount threshold").first()).toBeVisible();
  await expect(page.getByText("Queued").first()).toBeVisible();
});

test("the old /tasks/new opens the box on the tasks page, the text kept", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/tasks/new?text=Hello%20agent");
  await expect(page).toHaveURL(/\/\?text=Hello%20agent$/);
  await expect(page.getByLabel("What should the agent do")).toHaveValue("Hello agent");
});

test("POST without the CSRF header → 403", async ({ page }) => {
  await login(page, EMAIL.approver);
  const r = await page.request.post("/api/tasks/t_seed_docs/stop", { headers: { origin: "http://localhost:3100" }, data: {} });
  expect(r.status()).toBe(403);
});
