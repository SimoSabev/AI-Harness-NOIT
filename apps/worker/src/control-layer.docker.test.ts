import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { demoProfileLayers, sealProfile } from "@mandat/contract";
import { buildShopFixture } from "./index.js";
import { dockerEnv, repoRoot } from "./testing.js";

// v5 E8а (AC-2.2–2.4, 2.7): `mandat run --profile` compiles the control layer into /m/in/harness; the fakes run the
// harness hooks the way the CLIs would. Claude layout: git push refused (permission_denied), the agent's own
// .claude/settings.json is only a tree change. Codex: the pre_tool_use hook blocks, a tampered CODEX_HOME → UNKNOWN.
const main = path.join(repoRoot, "packages/cli/dist/main.js");
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-cl-"));
const profileFile = path.join(home, "profile.json");
beforeAll(async () => {
  await dockerEnv();
  buildShopFixture({ repoRoot, mandatHome: home, force: false });
  writeFileSync(profileFile, JSON.stringify(sealProfile({ version: 1, repo_id: "local", layers: demoProfileLayers(), sources: {}, approved_by: null, approved_at: null })));
});
function run(agent: string): { exit: number | null; v: { result: string; reasons: string[]; run_dir: string } } {
  const r = spawnSync("node", [main, "--home", home, "run", "--contract", path.join(repoRoot, "contracts/fix-discount.json"), "--agent", agent, "--profile", profileFile, "--json"], { encoding: "utf8", env: process.env, timeout: 600_000 });
  return { exit: r.status, v: JSON.parse(r.stdout.trim().split("\n").at(-1) ?? "{}") as { result: string; reasons: string[]; run_dir: string } };
}

describe("control layer from the profile (docker, fake agents)", () => {
  it("Claude layout (fake:sh2-probe): the hook refuses git push; harness.json has the denial; the repo's .claude/settings.json change is caught", () => {
    const { v } = run("fake:sh2-probe");
    const h = JSON.parse(readFileSync(path.join(v.run_dir, "harness.json"), "utf8")) as { target: string; denied: string[]; files_hash: string };
    expect(h.target).toBe("claude");
    expect(h.denied).toEqual(["Bash"]);
    expect(v.reasons.join(" ")).toContain(".claude/settings.json");
    expect(v.result).not.toBe("VERIFIED");
  });
  it("Codex (fake-codex:hook-probe): the pre_tool_use hook blocks git push; a tampered CODEX_HOME config → UNKNOWN config_change", () => {
    const { v } = run("fake-codex:hook-probe");
    const h = JSON.parse(readFileSync(path.join(v.run_dir, "harness.json"), "utf8")) as { target: string; tampered: string[] };
    expect(h.target).toBe("codex");
    expect(h.tampered).toContain("codex/config.toml");
    expect(v.result).toBe("UNKNOWN");
    expect(v.reasons.join(" ")).toContain("config_change");
    const transcript = readFileSync(path.join(v.run_dir, "transcript.jsonl"), "utf8");
    expect(transcript).toMatch(/git push origin HEAD.*"exit_code":2/);
  });
});
