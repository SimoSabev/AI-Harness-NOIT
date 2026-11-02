import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProviderNotice } from "@mandat/contract";
import { claudeAdapter, codexAdapter, fakeAdapter, fakeCodexAdapter, geminiAdapter } from "./index.js";

const gemini = geminiAdapter({ model: "gemini-3.8-flash", cliVersion: "0.65.0" });
const parse = (line: string) => gemini.providerNotice?.(line) ?? null;

describe("provider notices from a CLI's stderr (D-446)", () => {
  it("Gemini CLI: the retry lines of a real run's shape become typed codes, nothing else does", () => {
    const lines = readFileSync(path.join(import.meta.dirname, "../../../fixtures/gemini-stderr/retries.txt"), "utf8").split("\n");
    expect(lines.map(parse).filter((n) => n !== null)).toEqual([
      { problem: "overloaded", attempt: 1, max: 10 },
      { problem: "timed_out", attempt: 2, max: 10 },
      { problem: "rate_limited", attempt: 3, max: 10 },
      { problem: "key_rejected", attempt: 4, max: 10 },
      { problem: "unknown", attempt: 5, max: 10 },
      { problem: "unknown", attempt: 6, max: 10 },
      { problem: "overloaded", attempt: 10, max: 10 },
    ]);
  });
  it("a notice keeps no text of the line, so a secret in it cannot travel", () => {
    const n = parse("Attempt 3 failed with status 503. Retrying with backoff... sk-ant-abcdefghijklmnopqrstuvwxyz");
    expect(ProviderNotice.parse(n)).toEqual({ problem: "overloaded", attempt: 3, max: 10 });
    expect(JSON.stringify(n)).not.toContain("sk-ant");
  });
  it("a line that only looks similar gives no notice", () => {
    for (const l of ["", "  Attempt 1 failed with status 503.", "Attempt x failed", "My Attempt 1 failed with status 503.", "Attempt 1 succeeded", "status: 503"]) expect(parse(l), l).toBeNull();
  });
  it("Claude and Codex do not pretend: without a known format there is no parser and so no notice", () => {
    for (const a of [claudeAdapter({ model: "claude-sonnet-5-5", cliVersion: "2.1.302" }), codexAdapter({ model: "gpt-5.5-codex", cliVersion: "0.160.1" }), fakeAdapter("honest-fix"), fakeCodexAdapter("honest-fix")]) {
      expect(a.providerNotice, a.id).toBeUndefined();
    }
  });
});
