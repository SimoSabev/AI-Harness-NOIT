import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GoldenSet } from "./research-golden.js";

// E8к (v5 т. 4.10): the golden set of the RS spike — 20 questions, 10 project + 10 general; a project answer is literal
// text in the cited file, so the set itself is checked, not trusted.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("golden set (E8к)", () => {
  const set = GoldenSet.parse(JSON.parse(readFileSync(path.join(repoRoot, "fixtures/research/golden.json"), "utf8")) as unknown);
  it("20 въпроса, 10 проектни и 10 общи, уникални id", () => {
    expect(set.questions).toHaveLength(20);
    expect(set.questions.filter((q) => q.kind === "project")).toHaveLength(10);
    expect(new Set(set.questions.map((q) => q.id)).size).toBe(20);
  });
  it("проектен отговор е дословно във файла-източник; общият източник е https URL", () => {
    for (const q of set.questions) {
      if (q.kind === "project") expect([q.id, readFileSync(path.join(repoRoot, q.source), "utf8").includes(q.answers[0] as string)]).toEqual([q.id, true]);
      else expect(q.source).toMatch(/^https:\/\//);
    }
  });
  it("схемата отказва id извън формата и проектен източник извън fixtures/", () => {
    const one = set.questions[0];
    expect(GoldenSet.safeParse({ version: 1, questions: [{ ...one, id: "X1" }] }).success).toBe(false);
    expect(GoldenSet.safeParse({ version: 1, questions: [{ ...one, source: "../etc/passwd" }] }).success).toBe(false);
  });
});
