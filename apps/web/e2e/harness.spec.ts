import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { E2E_DB } from "../playwright.config";
import { EMAIL, TOTP, login, totpNow } from "./fixtures";

// Demo prompt §8.2 / D-298: Rules — scan (fakeGitHub) → a proposal with “source” → approve with TOTP → draft PR.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-e2e-home-"));
const worker = () => execFileSync("node", [path.join(repo, "packages/cli/dist/main.js"), "--home", home, "worker", "--once"], { env: { ...process.env, MANDAT_DB_URL: E2E_DB, MANDAT_BASELINE: "0" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120_000 });

test("rules: scan → a proposal with sources → approve with a code → draft PR, version 1", async ({ page }) => {
  await login(page, EMAIL.owner);
  await page.goto("/harness");
  await expect(page.getByRole("heading", { name: "Projects", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Scan the repository" }).click();
  await expect(page.getByText("Scanning the repository…")).toBeVisible();
  worker();
  await page.reload();
  await expect(page.getByText("Awaiting approval")).toBeVisible();
  await expect(page.getByRole("row", { name: /Install command.*from the lockfile/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /CI workflow.*from the CI configuration/ })).toBeVisible();
  await page.getByLabel("Code from the authenticator app (6 digits)").fill(totpNow(TOTP));
  await page.getByRole("button", { name: "Approve the rules" }).click();
  await expect(page.getByText("Approved. The rules apply to the next tasks.")).toBeVisible();
  worker();
  await page.reload();
  await expect(page.getByText(/draft PR #\d+/)).toBeVisible();
  await expect(page.getByText(/Rules version: 1/)).toBeVisible();
  // E8b (AC-2.1, AC-2.5): the scan also proposed the full profile — 8 layers with sources, the compiled preview, approve
  // D-384: the profile and the hidden tests sit under "Advanced" on the project
  await page.getByText("Advanced: agent profile and hidden tests").click();
  await expect(page.getByRole("heading", { name: "Agent profile" })).toBeVisible();
  await page.getByText("C · Permissions (allow, ask, deny)").click();
  await expect(page.getByText(/bash:git push \*/).first()).toBeVisible();
  await page.getByText("Preview: what the agent gets").click();
  await expect(page.getByText("/m/in/harness/claude/settings.json")).toBeVisible();
  await expect(page.getByText("/m/in/harness/codex/config.toml")).toBeVisible();
  await page.getByLabel("Authenticator code").fill(totpNow(TOTP));
  await page.getByRole("button", { name: "Approve this version" }).click();
  await expect(page.getByText("Approved as version 1.")).toBeVisible();
});

test("rules: an approver cannot approve", async ({ page }) => {
  await login(page, EMAIL.approver);
  await page.goto("/harness");
  await expect(page.getByRole("button", { name: "Approve the rules" })).toHaveCount(0);
  await expect(page.getByText("Only an owner scans and approves the rules.").first()).toBeVisible();
});
