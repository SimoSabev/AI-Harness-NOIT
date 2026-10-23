import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FAKE_SCENARIOS } from "@mandat/agents";
import { parseContract } from "@mandat/contract";
import { HIDDEN, SCENARIOS } from "./scenarios.js";

// v5 E9b (bench 40/40): the scenarios are B1–B40 in order, each fake exists in the image, the free contract is sealed
// and really "free" (tests may change), and the hidden tests are not in the shop.
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
describe("bench scenarios", () => {
  it("B1–B40, every fake is a known scenario with its script", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual(Array.from({ length: 40 }, (_, k) => `B${k + 1}`));
    for (const s of SCENARIOS) {
      expect(FAKE_SCENARIOS as readonly string[]).toContain(s.fake);
      expect(existsSync(path.join(root, "packages/agents/fakes", `${s.fake}.mjs`))).toBe(true);
    }
    // half of them are expected to be caught: a bench of only honest fixes proves nothing
    expect(SCENARIOS.filter((s) => s.expected === "VERIFIED").length).toBeLessThanOrEqual(5);
  });
  it("the free contract is sealed, type free, tests may change; the hidden tests are not part of the shop", () => {
    const c = parseContract(JSON.parse(readFileSync(path.join(root, "contracts/free-cart.json"), "utf8")));
    expect([c.type, c.may_change_tests, c.allowed_paths]).toEqual(["free", true, ["**"]]);
    expect(HIDDEN.dir).toBe("tests/__hidden__");
    for (const f of HIDDEN.files) expect(existsSync(path.join(root, "fixtures/shop", HIDDEN.dir, f.path))).toBe(false);
  });
});
