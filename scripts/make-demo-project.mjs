#!/usr/bin/env node
// The demo project for 4.12 (docs/prd/demo-2026-12-04.md): fixtures/bakery as a real git repository with a history of
// small commits, in a folder outside the harness, ready for "Add project". It never touches an existing folder unless
// --force is given, and then only one that is a git repository of this demo project.
// Usage: node scripts/make-demo-project.mjs [target folder] [--force]   (default: <repo>/../bakery-shop)
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(repo, "fixtures", "bakery");
const args = process.argv.slice(2);
const force = args.includes("--force");
const target = path.resolve(args.find((a) => !a.startsWith("--")) ?? path.join(repo, "..", "bakery-shop"));

if (target.startsWith(repo + path.sep)) {
  console.error("make-demo-project: the target must be outside the harness repository");
  process.exit(2);
}
if (existsSync(target) && readdirSync(target).length > 0) {
  const isDemo = existsSync(path.join(target, ".git")) && existsSync(path.join(target, "package.json")) && readFileSync(path.join(target, "package.json"), "utf8").includes('"bakery-shop"');
  if (!force || !isDemo) {
    console.error(`make-demo-project: ${target} is not empty${isDemo ? " (run with --force to make it again)" : ""}`);
    process.exit(2);
  }
  rmSync(target, { recursive: true, force: true });
}
mkdirSync(target, { recursive: true });

const env = { ...process.env, GIT_AUTHOR_NAME: "Bakery Dev", GIT_AUTHOR_EMAIL: "dev@bakery.invalid", GIT_COMMITTER_NAME: "Bakery Dev", GIT_COMMITTER_EMAIL: "dev@bakery.invalid" };
const git = (...a) => {
  const r = spawnSync("git", a, { cwd: target, env, encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`git ${a.join(" ")}: ${r.stderr}`);
    process.exit(3);
  }
  return r.stdout.trim();
};
const copy = (...rel) => {
  for (const r of rel) cpSync(path.join(src, r), path.join(target, r), { recursive: true });
};

// the history: each step adds what a team would have added then, with a date a few days apart
const STEPS = [
  { date: "2026-09-01T10:00:00+03:00", msg: "chore: start the bakery shop (TypeScript, Vitest)", files: ["package.json", "package-lock.json", "tsconfig.json", "vitest.config.ts", ".gitignore", "src/shared", "tests/shared.spec.ts"] },
  { date: "2026-09-04T15:30:00+03:00", msg: "feat(catalog): products, allergens and search", files: ["src/catalog", "tests/catalog.spec.ts"] },
  { date: "2026-09-10T11:15:00+03:00", msg: "feat(cart): the cart and 10% off over 50 EUR", files: ["src/cart", "tests/cart.spec.ts"] },
  { date: "2026-09-18T09:40:00+03:00", msg: "feat(orders): orders, statuses and delivery slots (18:00 cutoff, closed Sundays)", files: ["src/orders", "tests/orders.spec.ts"] },
  { date: "2026-09-29T16:05:00+03:00", msg: "feat(payments): card payments behind a gateway interface", files: ["src/payments", "tests/payments.spec.ts"] },
  { date: "2026-10-07T13:20:00+03:00", msg: "feat(api): routes for products, slots and orders", files: ["src/api", "tests/api.spec.ts"] },
  { date: "2026-10-15T10:00:00+03:00", msg: "docs: readme, architecture, contributing; ci", files: ["README.md", "docs", "CONTRIBUTING.md", ".github"] },
];

git("init", "-q", "-b", "main");
git("config", "core.autocrlf", "false");
for (const s of STEPS) {
  copy(...s.files);
  git("add", "-A");
  spawnSync("git", ["commit", "-q", "--no-gpg-sign", "-m", s.msg], { cwd: target, env: { ...env, GIT_AUTHOR_DATE: s.date, GIT_COMMITTER_DATE: s.date }, encoding: "utf8" });
}
const head = git("rev-parse", "--short", "HEAD");
const count = git("rev-list", "--count", "HEAD");
console.log(`demo project ready: ${target} (${count} commits, main at ${head})`);
console.log('next: open "Add project" and pick this folder');
