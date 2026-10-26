import { describe, expect, it } from "vitest";
import { SkillRef, sha256Tag } from "@mandat/contract";
import { BUILTIN_SKILLS, builtinSkillRef, skillTexts } from "./builtin-skills.js";

// E8e (v5 p. 4.5 (5)): the harness's own skills; the profile names them by content hash; the run checks the hash.
describe("builtin skills", () => {
  it("test-first and review exist; a ref carries the hash of the text", () => {
    expect(Object.keys(BUILTIN_SKILLS).sort()).toEqual(["research", "review", "test-first"]);
    const r = builtinSkillRef("test-first");
    expect(SkillRef.parse(r)).toEqual(r);
    expect(r.content_hash).toBe(sha256Tag(BUILTIN_SKILLS["test-first"].text));
  });
  it("skillTexts: builtin texts and repo texts whose hash matches the profile; a changed repo skill is left out", () => {
    const repoText = "Use lower case.\n";
    const refs = [builtinSkillRef("review"), { name: "sql-style", source: "repo" as const, content_hash: sha256Tag(repoText), description: "" }, { name: "changed", source: "repo" as const, content_hash: sha256Tag("old"), description: "" }];
    const r = skillTexts(refs, { "sql-style": repoText, changed: "new" });
    expect(Object.keys(r.texts).sort()).toEqual(["review", "sql-style"]);
    expect(r.dropped).toEqual([{ rule: "skill:changed", why: "the repo's skill changed since the profile was approved (hash)" }]);
  });
});

describe("the research skill (E9г, D-401)", () => {
  it("names every research tool, the verify step and the rules on URLs and untrusted text", () => {
    const t = BUILTIN_SKILLS.research.text;
    expect(t.startsWith("---\nname: research\n")).toBe(true);
    for (const tool of ["research_search", "research_read", "research_docs", "research_code", "research_ask", "research_verify", "research_recall"]) expect(t).toContain(tool);
    expect(t).toMatch(/A URL you did not get from a research tool is not a source/);
    expect(t).toMatch(/<untrusted>/);
  });
});
