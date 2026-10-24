import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_DB } from "../playwright.config";
import { EMAIL, login } from "./fixtures";

// v5 E9b (D12, D-364): the worker's before/after screenshots of a UI change on the task card — approver+ (a viewer sees
// no section and the PNG URL answers 404). The rows are removed after the file.
const db = async <T>(f: (c: pg.Client) => Promise<T>): Promise<T> => {
  const c = new pg.Client({ connectionString: E2E_DB });
  await c.connect();
  try {
    return await f(c);
  } finally {
    await c.end();
  }
};
const LIGHT = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAD0lEQVR4nGP4gAMwDKQEAI/fhwE0oEtKAAAAAElFTkSuQmCC", "base64");
const DARK = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAAD0lEQVR4nGPQwAEYBlICAJhwFoEbNrITAAAAAElFTkSuQmCC", "base64");
let cs = "";
test.beforeAll(async () => {
  await db(async (c) => {
    const r = (await c.query<{ cs: string; org: string; v: string }>(`select c.id::text as cs, c.org_id::text as org, v.id::text as v from public.changesets c
      join public.verdicts v on v.task_id = c.task_id where c.task_id = 't_seed_bugfix' order by c.attempt desc, v.attempt desc limit 1`)).rows[0] as { cs: string; org: string; v: string };
    cs = r.cs;
    const data = { routes: [{ route: "/", console_errors: [], failed_requests: [], screenshot: "ui/route-0.png", base_screenshot: "ui/base-route-0.png", visual_diff: 0.62 }] };
    await c.query("insert into public.evidence (org_id, verdict_id, detector, phase, status, summary, data, source, signature) values ($1::uuid, $2::uuid, 'D12.ui', 1, 'unknown', 'the page looks different', $3::jsonb, 'sandbox:verify', 'D12:visual_diff:/')", [r.org, r.v, JSON.stringify(data)]);
    await c.query("insert into public.changeset_shots (changeset_id, org_id, name, png) values ($1::uuid, $2::uuid, 'base-route-0.png', $3), ($1::uuid, $2::uuid, 'route-0.png', $4)", [r.cs, r.org, LIGHT, DARK]);
  });
});
test.afterAll(async () => {
  await db(async (c) => {
    await c.query("delete from public.changeset_shots where changeset_id = $1::uuid", [cs]);
    await c.query("delete from public.evidence where detector = 'D12.ui' and signature = 'D12:visual_diff:/'");
  });
});

test("D12 on the card: an approver compares before and after; a viewer sees neither", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/tasks/t_seed_bugfix");
  await expect(page.getByRole("region", { name: "How the pages look (before and after)" })).toBeVisible();
  await expect(page.getByText("62.0% of the pixels changed")).toBeVisible();
  const before = page.getByRole("img", { name: "Page / before the change" });
  await expect(before).toBeVisible();
  await expect(page.getByRole("img", { name: "Page / after the change" })).toBeVisible();
  expect(await before.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBe(8);
  const r = await page.request.get(`/api/changesets/${cs}/shots/route-0.png`);
  expect([r.status(), r.headers()["content-type"], r.headers()["x-content-type-options"]]).toEqual([200, "image/png", "nosniff"]);
  await page.getByText("Details: checks, trust, cost, log").click();
  await expect(page.getByText("The changed pages render in a browser")).toBeVisible();

  await page.context().clearCookies();
  await login(page, EMAIL.viewer);
  await page.goto("/tasks/t_seed_bugfix");
  await expect(page.getByRole("region", { name: "How the pages look (before and after)" })).toHaveCount(0);
  expect((await page.request.get(`/api/changesets/${cs}/shots/route-0.png`)).status()).toBe(404);
});
