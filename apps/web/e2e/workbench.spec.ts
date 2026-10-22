import { expect, test } from "@playwright/test";
import { EMAIL, login } from "./fixtures";

// D-307: the workbench screens exist with the design; without records they show the sample, marked; it can be switched off.
test("агенти, инструменти, нощна смяна, ресърч и сесията на задачата: дизайнът с ПРИМЕР", async ({ page, context }) => {
  await login(page, EMAIL.approver);
  // U4 (D-332): `next start` is production, where the sample is off unless the person turns it on
  await context.addCookies([{ name: "sample", value: "1", url: page.url() }]);
  for (const [url, h] of [["/agents", /Агенти/], ["/tools", "Инструменти"], ["/night", "Нощна смяна"], ["/research", "Ресърч"]] as const) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1, name: h })).toBeVisible();
    await expect(page.getByRole("note").filter({ hasText: "ПРИМЕР" })).toBeVisible();
  }
  await page.goto("/tasks/t_seed_bugfix");
  await expect(page.getByRole("heading", { name: "Сесията отвътре" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Повиквания на инструменти" })).toBeVisible();
  await expect(page.getByRole("log", { name: "Терминал на агента (само четене)" })).toContainText("ПРИМЕР");
});

test("в production без бисквитка примерът е изключен (U4)", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/agents");
  await expect(page.getByRole("note").filter({ hasText: "ПРИМЕР" })).toHaveCount(0);
});

test("примерите се изключват от Настройки", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/settings");
  await page.getByLabel("Показвай пример, където още няма истински данни").uncheck();
  await page.goto("/agents");
  await expect(page.getByRole("note").filter({ hasText: "ПРИМЕР" })).toHaveCount(0);
  await expect(page.getByText("Няма агенти в момента.")).toBeVisible();
});
