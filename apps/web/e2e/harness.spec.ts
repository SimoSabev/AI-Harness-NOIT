import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { E2E_DB } from "../playwright.config";
import { EMAIL, TOTP, login, totpNow } from "./fixtures";

// Демо промпт т. 8.2 „Готово, когато“: в UI Свържи (fakeGitHub) → предложение със source → Одобри + TOTP → PR чернова.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-e2e-home-"));
const worker = () => execFileSync("node", [path.join(repo, "packages/cli/dist/main.js"), "--home", home, "worker", "--once"], { env: { ...process.env, MANDAT_DB_URL: E2E_DB }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 });

test("харнес: Свържи → предложение със source → Одобри + TOTP → PR чернова", async ({ page }) => {
  await login(page, EMAIL.owner);
  await page.goto("/harness");
  await page.getByRole("button", { name: "Свържи" }).click();
  await expect(page.getByText("Сканирането е в опашката на worker-а.")).toBeVisible();
  worker();
  await page.reload();
  await expect(page.getByText("чака одобрение")).toBeVisible();
  await expect(page.getByRole("row", { name: /runtime\.install\s+lockfile/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /ci\.workflow\s+ci\.yml/ })).toBeVisible();
  const code = page.getByLabel("Код от приложението (6 цифри)");
  await code.fill(totpNow(TOTP));
  await page.getByRole("button", { name: "Одобри харнеса" }).click();
  await expect(page.getByText("Одобрено. Worker-ът отваря PR чернова.")).toBeVisible();
  worker();
  await page.reload();
  await expect(page.getByText(/PR чернова #\d+/)).toBeVisible();
  await expect(page.getByText("Версия на харнеса: 1")).toBeVisible();
});

test("харнес: approver не вижда бутоните за одобрение", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/harness");
  await expect(page.getByRole("button", { name: "Одобри харнеса" })).toHaveCount(0);
});
