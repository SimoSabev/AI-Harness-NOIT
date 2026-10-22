import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildShopFixture } from "./index.js";
import { runTask } from "./run.js";
import { dockerEnv, repoRoot } from "./testing.js";

// E8f (v5 p. 4.6 (3), AC-4.5): a rebase attempt runs no agent — the files the host rebased go into the work tree in the
// sandbox, then the usual export and verification give the new verdict.
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-rbd-"));
beforeAll(async () => {
  await dockerEnv();
  buildShopFixture({ repoRoot, mandatHome: home, force: false });
});

describe("rebase attempt (docker)", () => {
  it("the rebased src/cart.ts goes in without an agent → VERIFIED", async () => {
    const { readFileSync } = await import("node:fs");
    const cart = readFileSync(path.join(repoRoot, "fixtures/shop/src/cart.ts"), "utf8").replace("const DISCOUNT_THRESHOLD_CENTS = 50000;", "const DISCOUNT_THRESHOLD_CENTS = 5000;");
    const r = await runTask({ home, contractPath: path.join(repoRoot, "contracts/fix-discount.json"), agent: "fake:honest-fix", keep: false, json: true, applyFiles: [{ path: "src/cart.ts", data: Buffer.from(cart) }] });
    expect(r.verdict?.result).toBe("VERIFIED");
    const { existsSync } = await import("node:fs");
    expect(existsSync(path.join(r.runDir ?? "", "transcript.jsonl"))).toBe(false); // no agent ran
  }, 900_000);
});
