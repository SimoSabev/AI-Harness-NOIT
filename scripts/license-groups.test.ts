import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { workspacePackages } from "./check-licenses.mjs";
import { CORE_PACKAGES, HARNESS_PACKAGES, groupOf } from "./license-groups.mjs";

// В-1 / D-204 / D-238 (демо промпт т. 4).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APACHE_SHA256 = "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30";
const pkgs = workspacePackages();
const core = pkgs.filter((p) => groupOf(p.name) === "core");

function sources(dir: string): string[] {
  const src = path.join(dir, "src");
  if (!existsSync(src)) return [];
  return readdirSync(src, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.(ts|tsx|mjs|js)$/.test(f) && statSync(path.join(src, f)).isFile())
    .map((f) => path.join(src, f));
}

/** Every `@mandat/<name>` specifier in static imports, re-exports and dynamic imports. */
export function mandatImports(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["'](@mandat\/[a-z0-9-]+)(?:\/[^"']*)?["']/g)) out.add(m[1] as string);
  return [...out];
}

describe("license groups", () => {
  it("всеки workspace пакет е в точно една група", () => {
    expect(CORE_PACKAGES.filter((n) => HARNESS_PACKAGES.includes(n))).toEqual([]);
    expect(pkgs.filter((p) => groupOf(p.name) === null).map((p) => p.name)).toEqual([]);
    expect(core.map((p) => p.name).sort()).toEqual(["@mandat/contract", "@mandat/core", "@mandat/export", "@mandat/ledger", "@mandat/redaction", "@mandat/sandbox", "@mandat/verify", "@mandat/gate-github", "@mandat/mcp"].sort());
  });

  it("mandatImports разпознава import, export from и import()", () => {
    expect(mandatImports('import { a } from "@mandat/contract";\nexport * from "@mandat/cli/x";\nawait import("@mandat/agents");\nimport "@mandat/web";')).toEqual([
      "@mandat/contract",
      "@mandat/cli",
      "@mandat/agents",
      "@mandat/web",
    ]);
    expect(mandatImports('const s = "@mandat/cli";')).toEqual([]);
  });

  it("ядрото импортира само ядро (статично)", () => {
    const hits: string[] = [];
    for (const p of core) {
      for (const f of sources(p.dir)) {
        for (const spec of mandatImports(readFileSync(f, "utf8"))) if (groupOf(spec) !== "core") hits.push(`${path.relative(repo, f)} → ${spec}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("workspace зависимостите на ядрото са само ядро", () => {
    const hits = core.flatMap((p) => p.workspaceDeps.filter((d) => groupOf(d) !== "core").map((d) => `${p.name} → ${d}`));
    expect(hits).toEqual([]);
  });

  it("всеки пакет на ядрото има LICENSE (Apache-2.0), NOTICE, GPL текст (неактивен) и license в package.json", () => {
    for (const p of core) {
      const lic = readFileSync(path.join(p.dir, "LICENSE"));
      expect(createHash("sha256").update(lic).digest("hex"), p.name).toBe(APACHE_SHA256);
      const notice = readFileSync(path.join(p.dir, "NOTICE"), "utf8");
      expect(notice.startsWith(`Mandat ${p.name}\nCopyright 2026 Simeon Sabev\n`), p.name).toBe(true);
      expect(readFileSync(path.join(p.dir, "licenses/LICENSE-GPL-3.0-or-later.txt"), "utf8")).toContain("GNU GENERAL PUBLIC LICENSE");
      const pj = JSON.parse(readFileSync(path.join(p.dir, "package.json"), "utf8")) as { license: string; files?: string[] };
      expect(["Apache-2.0", "Apache-2.0 OR GPL-3.0-or-later"], p.name).toContain(pj.license);
      expect(pj.files ?? [], p.name).toEqual(expect.arrayContaining(["LICENSE", "NOTICE"]));
    }
  });

  it("харнесът остава GPL-3.0-or-later", () => {
    for (const p of pkgs.filter((x) => groupOf(x.name) === "harness")) {
      const pj = JSON.parse(readFileSync(path.join(p.dir, "package.json"), "utf8")) as { license?: string };
      expect(pj.license, p.name).toBe("GPL-3.0-or-later");
    }
  });

  it("mcp и verifyd пускат mandat-verify, никога GPL CLI (активно от E2)", () => {
    const hits: string[] = [];
    for (const p of pkgs.filter((x) => x.name === "@mandat/mcp" || x.name === "@mandat/verify")) {
      for (const f of sources(p.dir)) if (/packages\/cli|@mandat\/cli|\bmandat\.js\b/.test(readFileSync(f, "utf8"))) hits.push(path.relative(repo, f));
    }
    expect(hits).toEqual([]);
  });
});
