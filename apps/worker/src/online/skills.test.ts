import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_ORG_ID, DEMO_REPO_ID, seedMinimal } from "./seed.js";
import { upsertBuiltinPlugins, upsertSkills } from "./skills.js";

// E8e (v5 p. 4.5 (5), AC-5.7): the scan writes the skills catalog — the harness's skills (approved), the repo's (with hash;
// blocked ones carry the reason and never reach an agent). A rescan updates the rows, never duplicates them.
let db: Awaited<ReturnType<typeof pgliteDb>>;
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git" });
});
afterAll(() => db.end());

describe("skills catalog (AC-5.7)", () => {
  it("builtin approved; repo with hash; blocked with the reason; idempotent", async () => {
    const repo = [
      { name: "release-notes", path: ".claude/skills/release-notes/SKILL.md", description: "Release notes.", content_hash: `sha256:${"1".repeat(64)}`, blocked: null },
      { name: "sneaky", path: ".claude/skills/sneaky/SKILL.md", description: "Formats.", content_hash: `sha256:${"2".repeat(64)}`, blocked: "invisible character U+202E" },
    ];
    await upsertSkills(db, DEMO_ORG_ID, DEMO_REPO_ID, repo);
    await upsertSkills(db, DEMO_ORG_ID, DEMO_REPO_ID, repo);
    const rows = (await db.query<{ name: string; source: string; approved: boolean; blocked_reason: string | null; has_hash: boolean }>("select name, source, approved, blocked_reason, content_hash is not null as has_hash from public.skills order by name")).rows;
    expect(rows).toEqual([
      { name: "release-notes", source: "repo", approved: false, blocked_reason: null, has_hash: true },
      { name: "review", source: "builtin", approved: true, blocked_reason: null, has_hash: true },
      { name: "sneaky", source: "repo", approved: false, blocked_reason: "invisible character U+202E", has_hash: true },
      { name: "test-first", source: "builtin", approved: true, blocked_reason: null, has_hash: true },
    ]);
  });
  it("builtin plugins: the verdict in the PR is on; the night report, the UI snapshot and Slack wait for their phases", async () => {
    await upsertBuiltinPlugins(db, DEMO_ORG_ID);
    await upsertBuiltinPlugins(db, DEMO_ORG_ID);
    expect((await db.query("select name, kind, enabled from public.plugins order by name")).rows).toEqual([
      { name: "mandat-verdict-in-pr", kind: "check", enabled: true },
      { name: "night-report", kind: "notify", enabled: false },
      { name: "slack-notify", kind: "notify", enabled: false },
      { name: "ui-snapshot", kind: "check", enabled: false },
    ]);
  });
});
