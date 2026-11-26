import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FAKE_SCENARIOS } from "@mandat/agents";
import { languageOf, parseContract } from "@mandat/contract";
import { runBench } from "./run-bench.js";
import { LANGUAGES } from "./scenarios.js";

// E10 languages (D-689): L1–L7 on shop-py and shop-go, a set of its own (the visible bench stays B1–B40, 40/40).
const root = path.resolve(import.meta.dirname, "..");
describe("bench: езици (D-689)", () => {
  it("L1–L7, известни fakes със скрипт, поне половината трябва да бъдат хванати", () => {
    expect(LANGUAGES.map((s) => s.id)).toEqual(Array.from({ length: 7 }, (_, k) => `L${k + 1}`));
    for (const s of LANGUAGES) {
      expect(FAKE_SCENARIOS as readonly string[]).toContain(s.fake);
      expect(existsSync(path.join(root, "packages/agents/fakes", `${s.fake}.mjs`))).toBe(true);
    }
    expect(LANGUAGES.filter((s) => s.expected === "VERIFIED").length * 2).toBeLessThan(LANGUAGES.length);
  });
  it("договорите са запечатани, за езика си, base_commit = mirror-а на фикстурата", () => {
    for (const [file, lang] of [["fix-discount-py.json", "python"], ["fix-discount-go.json", "go"]] as const) {
      const c = parseContract(JSON.parse(readFileSync(path.join(root, "contracts", file), "utf8")));
      expect([languageOf(c.repo_config), c.type, c.may_change_tests]).toEqual([lang, "bugfix", false]);
    }
  });
  it("runBench --set languages: всяка сцена с договора и mirror-а на своята фикстура", async () => {
    const calls: { contractPath: string; agent: string; mirror?: string }[] = [];
    const run = (o: { contractPath: string; agent: string; mirror?: string }) => {
      calls.push(o);
      const s = LANGUAGES.find((x) => `fake:${x.fake}` === o.agent);
      return Promise.resolve({ verdict: { result: s?.expected ?? "FAILED", reasons: s?.reasons ?? [] }, agentExit: 0, error: null });
    };
    const r = await runBench({ home: "/h", contractPath: "/js.json", set: "languages", langContracts: { "shop-py": "/py.json", "shop-go": "/go.json" }, run: run as never });
    expect([r.pass, r.rows.length, r.false_verified]).toEqual([7, 7, 0]);
    expect(calls.map((c) => [c.mirror, c.contractPath])).toEqual(LANGUAGES.map((s) => [s.fixture, s.fixture === "shop-py" ? "/py.json" : "/go.json"]));
  });
  it("без договорите на езиците → infraError", async () => {
    const r = await runBench({ home: "/h", contractPath: "/js.json", set: "languages", run: (() => Promise.reject(new Error("no"))) as never });
    expect(r.infraError).toContain("L1");
  });
});
