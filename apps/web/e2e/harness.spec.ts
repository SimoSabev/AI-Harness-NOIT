import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { E2E_DB } from "../playwright.config";
import { EMAIL, TOTP, login, totpNow } from "./fixtures";

// т. 8.2 / D-298: Правила — сканирай (fakeGitHub) → предложение с „откъде“ → одобри с TOTP → PR чернова.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-e2e-home-"));
const worker = () => execFileSync("node", [path.join(repo, "packages/cli/dist/main.js"), "--home", home, "worker", "--once"], { env: { ...process.env, MANDAT_DB_URL: E2E_DB, MANDAT_BASELINE: "0" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 });

test("правила: сканирай → предложение с източници → одобри с код → PR чернова, версия 1", async ({ page }) => {
  await login(page, EMAIL.owner);
  await page.goto("/harness");
  await expect(page.getByRole("heading", { name: "Правила на репото", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Сканирай репото" }).click();
  await expect(page.getByText("Сканирам репото…")).toBeVisible();
  worker();
  await page.reload();
  await expect(page.getByText("Чака одобрение")).toBeVisible();
  await expect(page.getByRole("row", { name: /Команда за инсталиране.*от lockfile/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /CI процес.*от CI конфигурацията/ })).toBeVisible();
  await page.getByLabel("Код от приложението за кодове (6 цифри)").fill(totpNow(TOTP));
  await page.getByRole("button", { name: "Одобри правилата" }).click();
  await expect(page.getByText("Одобрено. Правилата важат за следващите задачи.")).toBeVisible();
  worker();
  await page.reload();
  await expect(page.getByText(/PR чернова #\d+/)).toBeVisible();
  await expect(page.getByText(/Версия на правилата: 1/)).toBeVisible();
});

test("правила: approver не може да одобрява", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/harness");
  await expect(page.getByRole("button", { name: "Одобри правилата" })).toHaveCount(0);
  await expect(page.getByText("Само собственик сканира и одобрява правилата.").first()).toBeVisible();
});
