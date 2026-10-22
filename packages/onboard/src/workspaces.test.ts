import { describe, expect, it } from "vitest";
import { parseMandatYml } from "@mandat/contract";
import { memView } from "./fixtures.test-helper.js";
import { propose } from "./propose.js";
import { scanRepo } from "./scan.js";

// v5 E8и (D-358): workspaces → per package; one install and one test run at the root.
const pnpmWs: Record<string, string> = {
  "package.json": JSON.stringify({ name: "shop", scripts: { test: "vitest run" }, devDependencies: { vitest: "5.0.5" } }),
  "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  "pnpm-workspace.yaml": 'packages:\n  - "packages/*"\n  - "!packages/ignored"\n',
  "packages/money/package.json": JSON.stringify({ name: "@shop/money" }),
  "packages/money/src/money.ts": "export {}",
  "packages/money/tests/money.spec.ts": "test",
  "packages/cart/package.json": JSON.stringify({ name: "@shop/cart", scripts: { test: "vitest run" } }),
  "packages/cart/src/cart.ts": "export {}",
  "packages/cart/test/cart.test.ts": "test",
  "packages/ignored/package.json": JSON.stringify({ name: "ignored" }),
  "packages/no-manifest/src/x.ts": "export {}",
};

describe("workspaces (E8и)", () => {
  it("pnpm-workspace.yaml: пакетите с package.json по глобовете, без отрицанията", () => {
    const s = scanRepo(memView(pnpmWs));
    expect(s.monorepo.tool).toBe("pnpm-workspaces");
    expect(s.monorepo.packages).toEqual([
      { dir: "packages/cart", name: "@shop/cart", srcDirs: ["src"], testDirs: ["test"] },
      { dir: "packages/money", name: "@shop/money", srcDirs: ["src"], testDirs: ["tests"] },
    ]);
  });

  it("package.json workspaces: масив и {packages} (yarn)", () => {
    const files = { ...pnpmWs, "package.json": JSON.stringify({ name: "shop", workspaces: ["packages/money"], devDependencies: { vitest: "5.0.5" } }), "package-lock.json": "{}" };
    delete (files as Record<string, string>)["pnpm-workspace.yaml"];
    delete (files as Record<string, string>)["pnpm-lock.yaml"];
    expect(scanRepo(memView(files)).monorepo.packages.map((p) => p.dir)).toEqual(["packages/money"]);
    files["package.json"] = JSON.stringify({ name: "shop", workspaces: { packages: ["packages/**"] } });
    expect(scanRepo(memView(files)).monorepo.packages.map((p) => p.dir)).toEqual(["packages/cart", "packages/ignored", "packages/money"]);
  });

  it("предложение: install и тестове в корена; test_globs и allowed_paths по пакет; без „не се поддържа“", () => {
    const p = propose(scanRepo(memView(pnpmWs)));
    expect(parseMandatYml(p.yaml).ok).toBe(true);
    expect(p.policy.runtime.install).toBe("pnpm install --frozen-lockfile --ignore-scripts");
    expect(p.policy.tests.command).toBe("npx vitest run --reporter=json --outputFile=$MANDAT_REPORT");
    expect(p.policy.tests.test_globs).toEqual(expect.arrayContaining(["packages/cart/test/**", "packages/money/tests/**"]));
    expect(p.policy.task_types.bugfix?.allowed_paths).toEqual(["packages/cart/src/**", "packages/money/src/**"]);
    expect(p.policy.task_types.feature?.allowed_paths).toEqual(["packages/cart/src/**", "packages/money/src/**", "packages/cart/test/**", "packages/money/tests/**"]);
    expect(p.policy.protected_paths).toContain("pnpm-workspace.yaml");
    expect(p.needs_human.join(" ")).not.toContain("monorepo");
  });

  it("yarn berry (lockfile с __metadata): същият install низ (D-301: само назовава мениджъра), lockfile-ът избира yarn 4; предупреждение", () => {
    const berry = { "package.json": JSON.stringify({ name: "x", scripts: { test: "vitest run" }, devDependencies: { vitest: "5.0.5" } }), "yarn.lock": "# generated\n\n__metadata:\n  version: 10\n", "src/a.ts": "", "tests/a.spec.ts": "" };
    const s = scanRepo(memView(berry));
    expect(s.yarnBerry).toBe(true);
    const p = propose(s);
    expect(p.policy.runtime.install).toBe("yarn install --frozen-lockfile --ignore-scripts");
    expect(p.needs_human.join(" ")).not.toContain("runner");
    expect(p.warnings.join(" ")).toContain("yarn berry");
    const v1 = { ...berry, "yarn.lock": "# yarn lockfile v1\n" };
    expect(scanRepo(memView(v1)).yarnBerry).toBe(false);
    expect(propose(scanRepo(memView(v1))).warnings.join(" ")).not.toContain("yarn berry");
  });
});
