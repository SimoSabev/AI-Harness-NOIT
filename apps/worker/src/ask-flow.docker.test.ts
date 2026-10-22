import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { demoProfileLayers, sealProfile } from "@mandat/contract";
import { buildShopFixture } from "./index.js";
import { runTask } from "./run.js";
import { dockerEnv, repoRoot } from "./testing.js";

// E8g (v5 p. 4.4 (2), AC-8.1): the fake calls an MCP tool the profile marks "ask"; the real harness hook refuses it and
// writes asks.jsonl; the run reports the ask (→ HELD tool_approval online). With a one-time grant the next attempt passes.
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-ask-"));
const profile = sealProfile({ version: 1, repo_id: "local", layers: demoProfileLayers(), sources: {}, approved_by: null, approved_at: null });
beforeAll(async () => {
  await dockerEnv();
  buildShopFixture({ repoRoot, mandatHome: home, force: false });
});

describe("ask flow (docker, fake:ask-probe)", () => {
  it("attempt 1: refused by the hook, the ask comes back; attempt 2 with the grant: allowed, the fix is VERIFIED", async () => {
    const contractPath = path.join(repoRoot, "contracts/fix-discount.json");
    const a1 = await runTask({ home, contractPath, agent: "fake:ask-probe", keep: false, json: true, profile });
    expect(a1.asks).toEqual([{ tool: "mcp:github.create_issue", reason: "a human decides on new issues" }]);
    expect(a1.verdict?.result).not.toBe("VERIFIED");
    const h1 = JSON.parse(readFileSync(path.join(a1.runDir ?? "", "harness.json"), "utf8")) as { denied: string[] };
    expect(h1.denied).toEqual(["mcp__github__create_issue"]);
    const a2 = await runTask({ home, contractPath, agent: "fake:ask-probe", keep: false, json: true, profile, grantOnce: ["mcp:github.create_issue"] });
    expect(a2.asks).toBeUndefined();
    expect(a2.verdict?.result).toBe("VERIFIED");
  }, 900_000);
});
