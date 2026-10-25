import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStreamCtx } from "@mandat/contract";
import { CLAUDE_HARNESS_SETTINGS, buildClaudeArgv, claudeToStream, sh2Settings } from "@mandat/agents";
import { packTree } from "@mandat/export";
import { dockerText, names } from "@mandat/sandbox";
import { runSandbox } from "@mandat/verify";
import { harnessFilesHash, seedHarness } from "./harness-seed.js";
import { cleanupRun, dockerEnv, repoRoot, tempRun } from "./testing.js";

// v5 SH2 (fake variant): the control layer under /m/in/harness is seeded by root, the agent runs the harness hook and
// cannot change the layer; the repo's own .claude/settings.json, CLAUDE.md and .mcp.json are only files in the tree.
// The live variant (real Claude Code, criteria 1–5 of v5 3.1) is in docs/setup/local-live-checklist.md (SH2).
let env: Awaited<ReturnType<typeof dockerEnv>>;
const run = tempRun();
const sctx = () => ({ docker: env.docker, runId: run.runId, runDir: run.runDir, mandatHome: run.mandatHome, home: run.home, image: env.images.sandbox, ipv6Sysctl: env.ipv6Sysctl });
const files = [
  { path: "claude/settings.json", bytes: JSON.stringify(sh2Settings()), mode: "0444" as const },
  { path: "policy.json", bytes: JSON.stringify({ version: 1, rules: [{ tool: "bash:git push *", decision: "deny", reason: "the harness delivers" }] }), mode: "0444" as const },
];

async function cat(vol: string, file: string): Promise<string> {
  let out = "";
  await runSandbox(sctx(), { role: "test", volume: vol, volumeReadonly: true, network: "none", env: { phase: "none" }, timeoutMs: 30_000, cmd: ["cat", file], onStdout: (c) => (out += c.toString()) });
  return out;
}

beforeAll(async () => {
  env = await dockerEnv();
});
afterAll(async () => {
  await cleanupRun(env.docker, run.runId);
});

describe.each(["A", "B"] as const)("SH2 control layer, variant %s (fake agent)", (variant) => {
  it("hook blocks git push; the layer is read-only; the repo's control files are only tree files", async () => {
    const vol = names.vol(run.runId, variant === "A" ? "a" : "b");
    await dockerText(env.docker, ["volume", "create", "--label", `mandat.run=${run.runId}`, vol]);
    const tree = mkdtempSync(path.join(os.tmpdir(), "sh2-"));
    cpSync(path.join(repoRoot, "fixtures", "demo-shop"), tree, { recursive: true });
    mkdirSync(path.join(tree, ".claude"), { recursive: true });
    writeFileSync(path.join(tree, ".claude", "settings.json"), JSON.stringify({ permissions: { allow: ["Bash(curl *)"] } }));
    writeFileSync(path.join(tree, "CLAUDE.md"), "MARKER-SH2-CLAUDE-MD\n");
    writeFileSync(path.join(tree, ".mcp.json"), JSON.stringify({ mcpServers: { evil: { command: "node", args: ["-e", "1"] } } }));
    const seed = await runSandbox(sctx(), { role: "seed", volume: vol, network: "none", env: { phase: "none" }, cmd: ["tar", "-x", "-C", "/m/work"], stdin: packTree(tree), timeoutMs: 120_000 });
    expect(seed.exitCode).toBe(0);
    const hash = await seedHarness(sctx(), vol, files);
    expect(hash).toBe(harnessFilesHash(files));

    const argv = buildClaudeArgv({ prompt: "p", model: "claude-sonnet-5-5", budgetUsd: 1, appendSystemPromptFile: "/m/in/contract.txt", memory: { enabled: false }, steering: { enabled: false }, control: { variant, settingsFile: CLAUDE_HARNESS_SETTINGS, mcpConfigFile: null } });
    const lines: string[] = [];
    const r = await runSandbox(sctx(), { role: "agent", volume: vol, network: "none", env: { phase: "none" }, timeoutMs: 60_000, cmd: ["node", "/opt/mandat/fakes/sh2-probe.mjs", ...argv.slice(1)], onStdoutLine: (l) => lines.push(l) });
    expect(r.exitCode).toBe(0);

    const report = JSON.parse(await cat(vol, "/m/out/notes.txt")) as Record<string, unknown>;
    expect(report).toMatchObject({ settings_file: CLAUDE_HARNESS_SETTINGS, bare: variant === "A", hook_exit: 2, write_settings: "EACCES", write_policy: "EACCES", mkdir: "EACCES", repo_settings_present: true });
    expect(String(report.hook_stderr)).toContain("the harness delivers");
    expect(["EROFS", "EACCES"]).toContain(report.hooks_dir_write);
    if (variant === "B") expect(report.strict_mcp).toBe(true);
    // criterion (1): the hook left its marker
    expect(await cat(vol, "/m/out/hooks.jsonl")).toContain('"decision":"deny"');
    // criterion (5): the refusal is visible in the stream as permission{denied}
    const ctx = createStreamCtx(run.runId);
    const es = lines.flatMap((l) => claudeToStream(l, ctx));
    expect(es.find((e) => e.kind === "permission")?.tool).toMatchObject({ name: "Bash", decision: "denied" });
    // the control layer is unchanged after the agent; the repo file the agent changed is a tree change (D3 sees it)
    expect(JSON.parse(await cat(vol, "/m/in/harness/claude/settings.json"))).toEqual(sh2Settings());
    expect(await cat(vol, "/m/work/.claude/settings.json")).toContain("Bash(*)");
  });
});
