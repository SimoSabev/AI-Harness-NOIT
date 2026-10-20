import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { DEMO_SHOP_FILES, SHOP_FILES } from "./fixtures.js";
import { repoRoot } from "./testing.js";

// Демо промпт т. 9.1 / S32.
const read = (f: string) => readFileSync(path.join(repoRoot, "fixtures/demo-shop", f), "utf8");

describe("fixtures/demo-shop", () => {
  it("= файловете на shop (байт по байт, освен README) + политика + CI", () => {
    for (const f of SHOP_FILES.filter((x) => x !== "README.md")) expect(read(f), f).toBe(readFileSync(path.join(repoRoot, "fixtures/shop", f), "utf8"));
    expect(DEMO_SHOP_FILES).toEqual(expect.arrayContaining([".mandat.yml", ".github/workflows/ci.yml"]));
  });
  it("ci.yml: тестове от HEAD, contents: read, без pull_request_target/workflow_run", () => {
    const ci = parse(read(".github/workflows/ci.yml")) as { on: Record<string, unknown>; permissions: Record<string, string>; jobs: { test: { steps: { uses?: string; run?: string }[] } } };
    expect(Object.keys(ci.on).sort()).toEqual(["pull_request", "push"]);
    const banned = (o: unknown): boolean => (typeof o === "object" && o !== null ? Object.entries(o).some(([k, v]) => k === "pull_request_target" || k === "workflow_run" || banned(v)) : false);
    expect(banned(ci)).toBe(false);
    expect(ci.permissions).toEqual({ contents: "read" });
    const steps = ci.jobs.test.steps;
    expect(steps.map((s) => s.uses ?? s.run)).toEqual(["actions/checkout@v7.0.1", "actions/setup-node@v7.1.0", "npm ci --ignore-scripts", "npx vitest run"]);
  });
});
