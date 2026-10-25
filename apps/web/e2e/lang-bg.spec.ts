import { expect, test } from "@playwright/test";
import { EMAIL, login } from "./fixtures";

// E7е (AC-12.10, U7): the same flow in Bulgarian — cookie lang=bg → inbox → task card → approve. It runs after
// inbox.spec.ts and approves the separate t_seed_mobile card (the inbox test approves t_seed_bugfix).
test("bg: inbox → task card → approve, all in Bulgarian", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "lang", value: "bg", url: baseURL ?? "http://localhost:3100" }]);
  await login(page, EMAIL.approver);
  await expect(page.locator("html")).toHaveAttribute("lang", "bg");
  await expect(page.getByRole("link", { name: "+ Нова задача" })).toBeVisible();
  await page.goto("/overview");
  await expect(page.getByRole("heading", { name: "Задачи", level: 1 })).toBeVisible();
  const waiting = page.locator("section", { has: page.getByRole("heading", { name: /Чака теб/ }) });
  await expect(waiting.getByText("съществува на base и липсва").first()).toBeVisible();
  await waiting.getByRole("link", { name: /Мобилна карта/ }).click();
  await page.waitForURL(/\/\?task=t_seed_mobile/);
  await expect(page.getByText("Чака одобрение").first()).toBeVisible();
  await expect(page.getByText("Мандат провери промяната и тя мина. Прегледай я и реши.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Промяната на агента" })).toBeVisible();
  await page.getByRole("button", { name: "Одобри промяната" }).click();
  await expect(page.getByText("Одобряваш тази промяна?")).toBeVisible();
  await page.getByRole("button", { name: "Да, одобри" }).click();
  await expect(page.getByText("Одобрена", { exact: true }).first()).toBeVisible();
});

test("bg from Accept-Language when there is no cookie; the cookie wins over it", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ locale: "bg-BG" });
  const page = await ctx.newPage();
  await page.goto(`${baseURL ?? "http://localhost:3100"}/login`);
  await expect(page.locator("html")).toHaveAttribute("lang", "bg");
  await expect(page.getByRole("button", { name: "Влез" })).toBeVisible();
  await ctx.addCookies([{ name: "lang", value: "en", url: baseURL ?? "http://localhost:3100" }]);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await ctx.close();
});
