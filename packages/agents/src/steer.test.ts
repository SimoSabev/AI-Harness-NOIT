import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { claudeAdapter } from "./claude/adapter.js";
import { codexAdapter } from "./codex/adapter.js";
import { fakeAdapter } from "./fake/adapter.js";

// E8g (v5 p. 4.4 (3), AC-8.5, D-353): "Steer" sends a person's text to a live Claude Code (stream-json on stdin);
// Codex has no such input → not steerable. The text reaches the agent framed as untrusted input.
const ctx = { runId: "r_x", taskId: "t_x", prompt: "Fix the discount", model: "claude-sonnet-5-5", budgetUsd: 1, contractFile: "/m/in/contract.txt", workdir: "/m/work", notesPath: "/m/out/notes.txt" } as const;
const canary = { name: "AWS_SECRET_ACCESS_KEY", value: "c" } as const;
const key = { ANTHROPIC_BASE_URL: "http://egress-gate", ANTHROPIC_API_KEY: "mdt_x" } as const;

describe("steering (AC-8.5)", () => {
  it("claude with ctx.steer: stream-json input, the prompt as the first stdin line, stdin stays open", () => {
    const a = claudeAdapter({ model: "claude-sonnet-5-5", cliVersion: "2.1.302" });
    expect(a.supportsSteering).toBe(true);
    const plain = a.launch(ctx, key, canary);
    expect(plain.stdin).toBe("closed");
    expect(plain.argv).toContain("Fix the discount");
    const s = a.launch({ ...ctx, steer: { sessionId: "00000000-0000-4000-8000-000000000001" } }, key, canary);
    expect(s.stdin).toBe("pipe");
    expect(s.argv).not.toContain("Fix the discount");
    expect(s.argv.join(" ")).toContain("--input-format stream-json --replay-user-messages");
    expect(JSON.parse(s.firstStdinLine ?? "{}")).toMatchObject({ type: "user", message: { role: "user", content: "Fix the discount" } });
  });
  it("a steer line is a user message with the text framed (escaped, marked as a person's steer)", () => {
    const a = claudeAdapter({ model: "claude-sonnet-5-5", cliVersion: "2.1.302" });
    const line = JSON.parse(a.steerLine?.("use <b>cents</b>", "ana") ?? "{}") as { type: string; message: { content: string } };
    expect(line.type).toBe("user");
    expect(line.message.content).toBe('<untrusted author="ana" association="member" source="steer">use &lt;b&gt;cents&lt;/b&gt;</untrusted>');
  });
  it("codex is not steerable", () => {
    expect(codexAdapter({ model: "gpt-5.5-codex", cliVersion: "0.160.1" }).supportsSteering).toBe(false);
  });
  it("the steer-echo fake replays each steer message into its stream and finishes on stdin end", () => {
    const a = fakeAdapter("steer-echo");
    expect(a.supportsSteering).toBe(true);
    const spec = a.launch({ ...ctx, steer: { sessionId: "s" } }, key, canary);
    expect(spec.stdin).toBe("pipe");
    const work = path.join(mkdtempSync(path.join(tmpdir(), "mandat-steer-")), "shop");
    cpSync(path.resolve(import.meta.dirname, "../../../fixtures/shop"), work, { recursive: true });
    const input = [spec.firstStdinLine, a.steerLine?.("round down", "ana")].join("\n") + "\n";
    const r = spawnSync(process.execPath, [path.resolve(import.meta.dirname, "../fakes/steer-echo.mjs")], { cwd: work, input, encoding: "utf8", env: { PATH: process.env.PATH ?? "", MANDAT_NOTES: path.join(work, "notes.txt") } });
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split("\n").map((l) => JSON.parse(l) as { type: string; message?: { content?: unknown } });
    expect(lines.filter((l) => l.type === "user").map((l) => JSON.stringify(l.message?.content))).toEqual([expect.stringContaining("round down")]);
    expect(lines.at(-1)?.type).toBe("result");
    expect(readFileSync(path.join(work, "src/cart.ts"), "utf8")).toContain("5000;");
  });
});
