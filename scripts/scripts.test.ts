import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkLicenses, flatten } from "./check-licenses.mjs";
import { scanForDotenv } from "./check-no-dotenv.mjs";
import { renderThirdParty } from "./gen-third-party.mjs";
import { spdxAllowed } from "./spdx.mjs";
import { config as vitestConfig } from "../vitest.config.js";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowlist = JSON.parse(readFileSync(path.join(repo, "license-allowlist.json"), "utf8")) as {
  allowed: string[];
  exceptions: { license: string; reason: string; devOnly: boolean }[];
};
const lic = (name: string) => JSON.parse(readFileSync(path.join(repo, "fixtures/licenses", name), "utf8")) as Record<string, { name: string; versions: string[]; license: string }[]>;
const one = (id: string, license: string) => new Map([[id, license]]);

describe("check-no-dotenv (D-065)", () => {
  const scan = (p: string, content: string) => scanForDotenv([{ path: p, content }]);
  it("попадения и allowlist", () => {
    expect(scan("packages/cli/src/x.ts", "const a = process.env.X;")).toEqual([]);
    expect(scan("packages/cli/src/x.ts", 'read("../.env")')).toHaveLength(1);
    expect(scan("packages/cli/src/x.ts", 'import "dotenv";')).toHaveLength(1);
    expect(scan("packages/cli/src/x.ts", 'const d = require("dotenv/config");')).toHaveLength(1);
    expect(scan("packages/core/src/d3.test.ts", 'const g = ".env.test*";')).toEqual([]);
    expect(scan("packages/cli/src/x.ts", 'const g = ".env.test*";')).toHaveLength(1);
    expect(scan("packages/x/package.json", JSON.stringify({ dependencies: { dotenv: "1.0.0" } }))).toHaveLength(1);
    expect(scan("packages/x/package.json", JSON.stringify({ dependencies: { zod: "4.6.7" } }))).toEqual([]);
    expect(scan("packages/cli/src/x.ts", "// mentions dotenv in a comment")).toEqual([]);
  });
});

describe("check-licenses (D-052, D-077)", () => {
  const allowed = new Set(allowlist.allowed);
  it("SPDX изрази", () => {
    expect(spdxAllowed("MIT OR CC0-1.0", allowed)).toBe(true);
    expect(spdxAllowed("(BSD-2-Clause OR MIT OR Apache-2.0)", allowed)).toBe(true);
    expect(spdxAllowed("MIT AND GPL-2.0", allowed)).toBe(false);
    expect(spdxAllowed("(MIT AND ISC) OR GPL-3.0", allowed)).toBe(true);
    expect(spdxAllowed("Apache-2.0 WITH LLVM-exception", allowed)).toBe(true);
    expect(() => spdxAllowed("(MIT", allowed)).toThrow();
    expect(() => spdxAllowed("MIT OR", allowed)).toThrow();
  });
  it("prod / dev изключения", () => {
    const empty = new Map<string, string>();
    expect(checkLicenses({ all: one("x@1.0.0", "Python-2.0"), prod: empty, allowlist }).ok).toBe(true);
    const prodFail = checkLicenses({ all: one("x@1.0.0", "Python-2.0"), prod: one("x@1.0.0", "Python-2.0"), allowlist });
    expect(prodFail.ok).toBe(false);
    expect(prodFail.failures.join("\n")).toContain("x@1.0.0");
    expect(checkLicenses({ all: one("y@1.0.0", "CC0-1.0"), prod: one("y@1.0.0", "CC0-1.0"), allowlist }).ok).toBe(false);
    expect(checkLicenses({ all: one("z@1.0.0", "SEE LICENSE IN LICENSE.md"), prod: empty, allowlist }).ok).toBe(false);
  });
  it("записаният изход на pnpm 12.14.0 (--recursive, --prod)", () => {
    const all = flatten(lic("pnpm-12.14.0.json"));
    const prod = flatten(lic("pnpm-12.14.0-prod.json"));
    expect(all.has("zod@4.6.7")).toBe(true);
    expect(all.has("tar@7.5.22")).toBe(true);
    expect(prod.has("tar@7.5.22")).toBe(true);
    expect([...prod.keys()].some((k) => k.startsWith("vitest@"))).toBe(false);
    expect(checkLicenses({ all, prod, allowlist }).ok).toBe(true);
    const md = renderThirdParty(lic("pnpm-12.14.0.json"), lic("pnpm-12.14.0-prod.json"));
    expect(md).toContain("| tar | 7.5.22 | BlueOak-1.0.0 | runtime |");
    expect(md).toContain("| vitest | 5.0.5 | MIT | dev |");
  });
});

describe("репо", () => {
  it("core не импортира инфраструктура (статичен)", () => {
    const banned = /@mandat\/(sandbox|egress-gate|llm-proxy|agents|export)\b|node:child_process/;
    const dir = path.join(repo, "packages/core/src");
    const files = existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts")) : [];
    const hits = files.filter((f) => statSync(path.join(dir, f)).isFile() && banned.test(readFileSync(path.join(dir, f), "utf8")));
    expect(hits).toEqual([]);
    expect(banned.test('import { x } from "@mandat/sandbox";')).toBe(true);
    expect(banned.test('import { spawn } from "node:child_process";')).toBe(true);
    expect(banned.test('import { z } from "@mandat/contract";')).toBe(false);
  });

  it("pnpm check не вижда fixtures (D-051)", () => {
    const ls = execFileSync("pnpm", ["-r", "ls", "--depth", "-1", "--json"], { cwd: repo, encoding: "utf8" });
    const dirs = (JSON.parse(ls) as { path: string }[]).map((p) => path.relative(repo, p.path));
    expect(dirs.some((d) => d.startsWith("fixtures"))).toBe(false);
    expect(dirs).toContain("packages/contract");
    expect(vitestConfig.test?.exclude).toContain("fixtures/**");
  });
});
