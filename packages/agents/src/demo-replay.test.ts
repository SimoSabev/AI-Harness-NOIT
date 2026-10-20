import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Демо промпт т. 9 demo-replay.test: `fake:replay-claude` и `fake-codex:replay` излъчват записа байт по байт и прилагат patch-а.
const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const fakes = path.join(repo, "packages/agents/fakes");
const rec = path.join(repo, "demo/recordings");

function run(script: string, name: string) {
  const d = mkdtempSync(path.join(os.tmpdir(), "replay-"));
  cpSync(path.join(repo, "fixtures/demo-shop"), d, { recursive: true });
  const contract = path.join(d, "..", `${path.basename(d)}-contract.txt`);
  writeFileSync(contract, `Task: fix it\n\n[mandat-replay: ${name}]\n`);
  const r = spawnSync("node", [path.join(fakes, script)], { cwd: d, env: { PATH: process.env.PATH, MANDAT_REPLAY_DIR: rec, MANDAT_REPLAY_CONTRACT: contract }, encoding: "buffer" });
  return { d, r };
}

describe("demo-replay", () => {
  for (const [script, name] of [["replay-claude.mjs", "scene1-task1"], ["replay-claude.mjs", "scene1-task2"], ["codex-replay.mjs", "scene2"]] as const) {
    it(`${script} ${name}: stdout = записът байт по байт; patch-ът = git apply`, () => {
      const { d, r } = run(script, name);
      expect(r.status).toBe(0);
      expect(Buffer.compare(r.stdout, readFileSync(path.join(rec, `${name}.jsonl`)))).toBe(0);
      const g = mkdtempSync(path.join(os.tmpdir(), "replay-git-"));
      cpSync(path.join(repo, "fixtures/demo-shop"), g, { recursive: true });
      execFileSync("git", ["apply", path.join(rec, `${name}.patch`)], { cwd: g, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" } });
      expect(readFileSync(path.join(d, "src/cart.ts"), "utf8")).toBe(readFileSync(path.join(g, "src/cart.ts"), "utf8"));
    });
  }
  it("без [mandat-replay: …] → exit 3; patch, който не пасва (вече приложен) → exit 3", () => {
    const d = mkdtempSync(path.join(os.tmpdir(), "replay-"));
    const c = path.join(d, "c.txt");
    writeFileSync(c, "no marker");
    expect(spawnSync("node", [path.join(fakes, "replay-claude.mjs")], { cwd: d, env: { PATH: process.env.PATH, MANDAT_REPLAY_DIR: rec, MANDAT_REPLAY_CONTRACT: c } }).status).toBe(3);
    const { d: done } = run("replay-claude.mjs", "scene1-task1");
    writeFileSync(c, "[mandat-replay: scene1-task1]");
    expect(spawnSync("node", [path.join(fakes, "replay-claude.mjs")], { cwd: done, env: { PATH: process.env.PATH, MANDAT_REPLAY_DIR: rec, MANDAT_REPLAY_CONTRACT: c } }).status).toBe(3);
  });
});
