import { expect, test } from "@playwright/test";
import { EMAIL, TOTP, login, totpNow } from "./fixtures";

// D-292: the minimal harness — list → task → decision; a new task from the form.
test.describe.configure({ mode: "serial" });

test("viewer: списъкът — „Чака теб“ с 4 задачи, брояч в title, причината на провала", async ({ page }) => {
  await login(page, EMAIL.viewer);
  await expect(page.getByRole("heading", { name: "Задачи", level: 1 })).toBeVisible();
  const waiting = page.locator("section", { has: page.getByRole("heading", { name: /Чака теб/ }) });
  await expect(waiting.locator("li")).toHaveCount(4);
  await expect(page).toHaveTitle("4 чакат · Мандат");
  await expect(waiting.getByText("съществува на base и липсва").first()).toBeVisible();
});

test("viewer: задачата без diff и без бутони за решение", async ({ page }) => {
  await login(page, EMAIL.viewer);
  await page.goto("/tasks/t_seed_bugfix");
  await expect(page.getByText("Чака одобрение").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Промяната на агента" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Одобри промяната" })).toHaveCount(0);
});

test("провал: причината на обикновен език и проверката, която не мина", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/tasks/t_seed_failed");
  await expect(page.getByText("Мандат отхвърли промяната.")).toBeVisible();
  await expect(page.getByText("Никой тест не е изтрит, прескочен или отслабен")).toBeVisible();
  await expect(page.getByRole("button", { name: "Пусни отново" })).toBeVisible();
});

test("approver: одобри (потвърждение) → „Одобрена“", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/tasks/t_seed_bugfix");
  await expect(page.getByRole("heading", { name: "Промяната на агента" })).toBeVisible();
  await page.getByRole("button", { name: "Одобри промяната" }).click();
  await expect(page.getByText("Одобряваш тази промяна?")).toBeVisible();
  await page.getByRole("button", { name: "Да, одобри" }).click();
  await expect(page.getByText("Одобрена").first()).toBeVisible();
});

test("approver: ниво 1 иска нов TOTP код; грешен → съобщение; верен → „Одобрена“", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/");
  await page.getByRole("link", { name: /SAVE10/ }).click();
  await page.getByRole("button", { name: "Одобри промяната" }).click();
  const code = page.getByLabel("Код от приложението (6 цифри)");
  await code.fill(totpNow(TOTP) === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Да, одобри" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Кодът" })).toHaveText("Кодът не е верен или е изтекъл.");
  await code.fill(totpNow(TOTP));
  await page.getByRole("button", { name: "Да, одобри" }).click();
  await expect(page.getByText("Одобрена").first()).toBeVisible();
});

test("нова задача: демо агент → картата на задачата „На опашка“", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.getByRole("link", { name: "+ Нова задача" }).click();
  await page.getByLabel("Какво да направи агентът").fill("Поправи прага на отстъпката");
  await page.getByLabel(/Демо: трие тест/).check();
  await page.getByRole("button", { name: "Пусни агента" }).click();
  await page.waitForURL(/\/tasks\/t_/);
  await expect(page.getByRole("heading", { name: "Поправи прага на отстъпката" })).toBeVisible();
  await expect(page.getByText("На опашка")).toBeVisible();
});

test("POST без CSRF заглавка → 403", async ({ page }) => {
  await login(page, EMAIL.approver);
  const r = await page.request.post("/api/tasks/t_seed_docs/stop", { headers: { origin: "http://localhost:3100" }, data: {} });
  expect(r.status()).toBe(403);
});
