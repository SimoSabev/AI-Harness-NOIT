import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DB } from "../playwright.config";
import { EMAIL, login } from "./fixtures";

// the re-queued task must not reach the worker that later specs run (it would fail and show up in "Waiting for you")
test.afterAll(async () => {
  const c = new pg.Client({ connectionString: E2E_DB });
  await c.connect();
  await c.query("delete from public.tasks where id = 't_e2e_ask'").finally(() => c.end());
});

// E8g (v5 p. 4.4, AC-8.1/8.5): a task waiting for a tool permission shows one card per ask; "Allow once" starts a new
// attempt. The data is made here and removed after the file (the inbox counts of the other specs stay).
test("ask card: Needs permission → Allow once → the task is queued again; the steer box is there while it waits to run", async ({ page }) => {
  const c = new pg.Client({ connectionString: E2E_DB });
  await c.connect();
  try {
    await c.query(`insert into public.tasks (id, org_id, repo_id, type, agent, text, state)
      select 't_e2e_ask', org_id, repo_id, 'bugfix', 'claude', 'Fix the discount (needs an issue)', 'GATED' from public.tasks where id = 't_seed_bugfix'`);
    await c.query("update public.tasks set state = 'HELD', wait_reason = 'tool_approval', last_result = 'VERIFIED' where id = 't_e2e_ask'");
    await c.query("insert into public.tool_asks (org_id, task_id, attempt, tool, reason) select org_id, id, 1, 'mcp:github.create_issue', 'a human decides on new issues' from public.tasks where id = 't_e2e_ask'");
  } finally {
    await c.end();
  }
  await login(page, EMAIL.owner);
  await page.goto("/tasks/t_e2e_ask");
  await expect(page.getByText("Needs permission").first()).toBeVisible();
  await expect(page.getByText("mcp:github.create_issue")).toBeVisible();
  await page.getByRole("button", { name: "Allow once" }).click();
  // D-386: the one task view — the task is queued again, the cards give way to the box that steers the agent
  await expect(page.getByText("Queued").first()).toBeVisible();
  await page.getByLabel("Your note to the agent").fill("keep the amounts in cents");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Saved; it goes into the next attempt.")).toBeVisible();
});
