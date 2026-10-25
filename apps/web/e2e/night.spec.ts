import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DB } from "../playwright.config";
import { EMAIL, login } from "./fixtures";

// v5 E9a (5.1 (2)): plan → the morning question of a parked task → "Answer and continue" starts a new attempt. The data
// is removed after the file.
const db = async <T>(f: (c: pg.Client) => Promise<T>): Promise<T> => {
  const c = new pg.Client({ connectionString: E2E_DB });
  await c.connect();
  try {
    return await f(c);
  } finally {
    await c.end();
  }
};
test.afterAll(async () => {
  await db(async (c) => {
    await c.query("delete from public.tasks where id = 't_e2e_park'");
    await c.query("delete from public.night_shifts");
  });
});

test("night: plan a night → it is planned with its queue; a parked task's question → Answer and continue → a new attempt", async ({ page }) => {
  await login(page, EMAIL.owner);
  await page.goto("/night");
  await page.getByLabel("Task").first().fill("Update the README with the new commands");
  await page.getByRole("button", { name: "Confirm for tonight" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Update the README with the new commands" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm for tonight" })).toHaveCount(0);
  // the worker ran the night (simulated): the shift is done and one task is parked with a question
  await db(async (c) => {
    const s = (await c.query<{ id: string; org_id: string }>("update public.night_shifts set status = 'done', report = '{}' returning id::text as id, org_id::text as org_id")).rows[0] as { id: string; org_id: string };
    await c.query(`insert into public.tasks (id, org_id, repo_id, type, agent, text, state, attempt, shift_id)
      select 't_e2e_park', org_id, repo_id, 'bugfix', 'claude', 'Cache the embeddings', 'BLOCKED', 2, $1::uuid from public.tasks where id = 't_seed_bugfix'`, [s.id]);
    await c.query("insert into public.night_questions (org_id, shift_id, task_id, what_stopped, tried, proposal) values ($1::uuid, $2::uuid, 't_e2e_park', 'FAILED after 2 attempt(s): `D4:out_of_contract:infra/**`', '[\"attempt 1: FAILED\", \"attempt 2: FAILED\"]', 'Add infra/** to allowed_paths of this task type, or narrow the task so it stays inside the contract.')", [s.org_id, s.id]);
  });
  await page.reload();
  await expect(page.getByText("FAILED after 2 attempt(s): `D4:out_of_contract:infra/**`")).toBeVisible();
  await expect(page.getByRole("link", { name: "Make a task" })).toHaveAttribute("href", /^\/\?text=Cache%20the%20embeddings/);
  await page.getByLabel("Your answer").fill("infra/** is fine for this task");
  await page.getByRole("button", { name: "Answer and continue" }).click();
  await expect(page.getByText("Answered: infra/** is fine for this task")).toBeVisible();
  const t = await db(async (c) => (await c.query<{ state: string; attempt: number }>("select state, attempt from public.tasks where id = 't_e2e_park'")).rows[0]);
  expect(t).toEqual({ state: "CREATED", attempt: 3 });
});
