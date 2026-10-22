import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DB } from "../playwright.config";
import { EMAIL, login } from "./fixtures";

// D-307: the workbench screens exist with the design; without records they show the sample, marked; it can be switched off.
test("agents, tools, night shift, research and the task session: the design with SAMPLE", async ({ page, context }) => {
  // E8e: a repo scan (harness.spec) fills the skills and plugins catalog; the sample shows only on empty pages
  const c = new pg.Client({ connectionString: E2E_DB });
  await c.connect();
  await c.query("delete from public.skills; delete from public.plugins").finally(() => c.end());
  await login(page, EMAIL.approver);
  // U4 (D-332): `next start` is production, where the sample is off unless the person turns it on
  await context.addCookies([{ name: "sample", value: "1", url: page.url() }]);
  for (const [url, h] of [["/agents", /Agents/], ["/tools", "Tools"], ["/night", "Night shift"], ["/research", "Research"]] as const) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1, name: h })).toBeVisible();
    await expect(page.getByRole("note").filter({ hasText: "SAMPLE" })).toBeVisible();
  }
  await page.goto("/tasks/t_seed_bugfix");
  await expect(page.getByRole("heading", { name: "The session inside" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tool calls" })).toBeVisible();
  // the sample content itself (lib/sample.ts) is a labelled sample and is not translated (D-348)
  await expect(page.getByRole("log", { name: "Agent terminal (read-only)" })).toContainText("claude-sonnet");
});

test("in production without the cookie the sample is off (U4)", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/agents");
  await expect(page.getByRole("note").filter({ hasText: "SAMPLE" })).toHaveCount(0);
});

test("samples are switched off in Settings", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/settings");
  await page.getByLabel("Show a sample where there is no real data yet").uncheck();
  await page.goto("/agents");
  await expect(page.getByRole("note").filter({ hasText: "SAMPLE" })).toHaveCount(0);
  await expect(page.getByText("No agents right now.")).toBeVisible();
});
