import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// D-582/D-585: write_prompt types into the field marked data-voice="prompt". Each screen with more than one text area
// marks its main one, or Jarvis cannot write there (live 22.11.2026: the research screen has the question and instructions).
const src = (p: string): string => readFileSync(new URL(`../components/${p}`, import.meta.url), "utf8");

describe("the prompt field of each screen (D-585)", () => {
  it("the task box and the research question are marked, once each", () => {
    for (const f of ["workspace.tsx", "research-form.tsx"]) expect(src(f).match(/data-voice="prompt"/g), f).toHaveLength(1);
  });
  it("on the research screen it is the question, not the instructions", () => {
    const line = src("research-form.tsx").split("\n").find((l) => l.includes('data-voice="prompt"')) ?? "";
    expect(line).toContain("setQuestion");
  });
});
