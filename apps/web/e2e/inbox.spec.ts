import { expect, test } from "@playwright/test";
import { EMAIL, TOTP, login, totpNow } from "./fixtures";

// Демо промпт т. 8.1: login → inbox (3 карти + обобщение) → карта → одобри (tap и TOTP).
test.describe.configure({ mode: "serial" });

test("inbox на seed-а: 3 карти, обобщение, брояч в title", async ({ page }) => {
  await login(page, EMAIL.viewer);
  await expect(page.getByRole("heading", { name: "Чака теб", level: 1 })).toBeVisible();
  await expect(page.locator(".summary")).toHaveText("1 ПРОВЕРЕНО и слети сами · 1 ПРОВАЛ · 3 чакат теб");
  await expect(page.locator("main .cards > li")).toHaveCount(3);
  await expect(page).toHaveTitle("3 чакат · Мандат");
  await expect(page.locator(".card").first().locator(".verdict")).toContainText("ПРОВЕРЕНО");
  await expect(page.getByText("Тестът ‹test_id›").or(page.getByText("съществува на base и липсва"))).toBeVisible();
  await expect(page.getByText("A 20/20 · B 19/20 (20 → 19)")).toBeVisible();
  await expect(page.getByText("Слой: агент")).toBeVisible();
  // viewer: no action buttons that change state
  await expect(page.getByRole("button", { name: "Одобри" })).toHaveCount(0);
});

test("viewer: картата без diff", async ({ page }) => {
  await login(page, EMAIL.viewer);
  await page.goto("/tasks/t_seed_bugfix?tab=diff");
  await expect(page.getByText("Diff-ът се вижда от одобряващ и собственик.")).toBeVisible();
});

test("approver: карта → одобри (едно докосване + потвърждение) → излиза от inbox", async ({ page }) => {
  await login(page, EMAIL.approver);
  const card = page.locator("article", { hasText: "Поправи закръглянето на ДДС" });
  await card.getByRole("button", { name: "Одобри" }).click();
  await expect(card.getByText("Потвърди одобрението на тази промяна.")).toBeVisible();
  await card.getByRole("button", { name: "Одобри" }).last().click();
  await expect(page.locator("article", { hasText: "Поправи закръглянето на ДДС" })).toHaveCount(0);
  await expect(page).toHaveTitle("2 чакат · Мандат");
});

test("approver: ниво 1 → сливане иска нов TOTP код; грешен код → съобщение; верен → одобрено", async ({ page }) => {
  await login(page, EMAIL.approver);
  const card = page.locator("article", { hasText: "SAVE10" });
  await card.getByRole("button", { name: "Одобри" }).click();
  const code = card.getByLabel("Код от приложението (6 цифри)");
  await code.fill(totpNow(TOTP) === "000000" ? "111111" : "000000");
  await card.getByRole("button", { name: "Одобри" }).last().click();
  await expect(card.getByRole("alert")).toHaveText("Кодът не е верен или е изтекъл.");
  await code.fill(totpNow(TOTP));
  await card.getByRole("button", { name: "Одобри" }).last().click();
  await expect(page.locator("article", { hasText: "SAVE10" })).toHaveCount(0);
});

test("дъска: 7 колони, подсказка при първо отваряне; ПРОВАЛ в „Блокирано / Провал“", async ({ page }) => {
  await login(page, EMAIL.viewer);
  await page.goto("/board");
  await expect(page.getByText("Колоните ги мести присъдата, ти действаш с бутоните.")).toBeVisible();
  await expect(page.locator(".board > section")).toHaveCount(7);
  await expect(page.locator("section", { has: page.getByRole("heading", { name: /Блокирано \/ Провал/ }) }).getByText("Направи теста за 10% отстъпка")).toBeVisible();
});

test("POST без CSRF заглавка → 403", async ({ page }) => {
  await login(page, EMAIL.approver);
  const r = await page.request.post("/api/tasks/t_seed_docs/stop", { headers: { origin: "http://localhost:3100" }, data: {} });
  expect(r.status()).toBe(403);
});
