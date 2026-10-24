import { expect, test } from "@playwright/test";
import { EMAIL, login } from "./fixtures";

// D-384: three sections in the side bar; the other screens still open by link and show only real data (no samples).
test("the side bar has tasks, projects and settings", async ({ page }) => {
  await login(page, EMAIL.approver);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link")).toHaveText([/Tasks/, "Projects", "Settings"]);
  await nav.getByRole("link", { name: "Projects" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toBeVisible();
  await expect(page.getByRole("link", { name: "+ Add project" })).toBeVisible();
  await nav.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("link", { name: "Open accounts" })).toBeVisible();
  await page.getByText("Advanced").click();
  await expect(page.getByRole("link", { name: "System" })).toBeVisible();
});

test("agents, tools, night shift, research: real data only, no SAMPLE", async ({ page }) => {
  await login(page, EMAIL.approver);
  for (const [url, h] of [["/agents", /Agents/], ["/tools", "Tools"], ["/night", "Night shift"], ["/research", "Research"]] as const) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1, name: h })).toBeVisible();
    await expect(page.getByText("SAMPLE")).toHaveCount(0);
  }
  await page.goto("/agents");
  await expect(page.getByText("No agents right now.", { exact: false })).toBeVisible();
});

test("a task without a recorded session shows no empty session panels", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/tasks/t_seed_bugfix");
  await expect(page.getByRole("heading", { name: "The session inside" })).toHaveCount(0);
});
