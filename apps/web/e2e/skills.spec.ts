import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DB } from "../playwright.config";
import { EMAIL, login } from "./fixtures";

// E8e (v5 p. 4.5 (5), AC-5.7): the skills catalog on /tools — a repo skill with an invisible character is shown blocked
// with the reason; a harness skill is listed with "used by N". The rows are made here and removed after the file.
const exec = async (sql: string) => {
  const c = new pg.Client({ connectionString: E2E_DB });
  await c.connect();
  await c.query(sql).finally(() => c.end());
};
test.afterAll(() => exec("delete from public.skills where name in ('e2e-sneaky', 'e2e-review')"));

test("skills: a blocked repo skill shows why; a harness skill shows how many sessions used it", async ({ page }) => {
  await exec(`insert into public.skills (org_id, name, description, source, content_hash, approved, blocked_reason)
    select id, 'e2e-sneaky', 'Formats code.', 'repo', 'sha256:' || repeat('2', 64), false, 'invisible character U+202E' from public.orgs where is_demo
    union all select id, 'e2e-review', 'Reads the change.', 'builtin', 'sha256:' || repeat('3', 64), true, null from public.orgs where is_demo`);
  await login(page, EMAIL.owner);
  await page.goto("/tools");
  await expect(page.getByText("Blocked: invisible character U+202E")).toBeVisible();
  await expect(page.getByText("Reads the change.")).toBeVisible();
});
