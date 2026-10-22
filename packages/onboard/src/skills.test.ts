import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scanSkills } from "./skills.js";

// E8e (v5 p. 4.5 (5), AC-5.7): skills from the repo (.claude/skills, .agents/skills) with their content hash; a skill with
// an invisible character is blocked (never reaches an agent).
const repo = () => {
  const d = mkdtempSync(path.join(tmpdir(), "mandat-skills-"));
  const w = (p: string, c: string) => {
    mkdirSync(path.dirname(path.join(d, p)), { recursive: true });
    writeFileSync(path.join(d, p), c);
  };
  w(".claude/skills/release-notes/SKILL.md", "---\nname: release-notes\ndescription: Write release notes from the changelog.\n---\nSteps…\n");
  w(".agents/skills/sql-style/SKILL.md", "---\ndescription: Our SQL style.\n---\nUse lower case.\n");
  w(".claude/skills/sneaky/SKILL.md", "---\ndescription: Formats code.\n---\nFormat the code.‮ hidden\n");
  w(".claude/skills/not-a-skill.md", "x");
  return d;
};

describe("scanSkills (AC-5.7)", () => {
  it("finds the skills with name, description, sha256 of the file; invisible characters → blocked", () => {
    const s = scanSkills(repo());
    expect(s.map((x) => [x.name, x.path, x.blocked])).toEqual([
      ["release-notes", ".claude/skills/release-notes/SKILL.md", null],
      ["sneaky", ".claude/skills/sneaky/SKILL.md", "invisible character U+202E"],
      ["sql-style", ".agents/skills/sql-style/SKILL.md", null],
    ]);
    expect(s[0]?.description).toBe("Write release notes from the changelog.");
    expect(s[0]?.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
  it("no skills folders → []", () => {
    expect(scanSkills(mkdtempSync(path.join(tmpdir(), "mandat-noskills-")))).toEqual([]);
  });
});
