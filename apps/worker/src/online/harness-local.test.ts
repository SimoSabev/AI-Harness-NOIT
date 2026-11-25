import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeGitHub } from "@mandat/gate-github";
import { deliverHarnessPr, scanForProposal } from "./harness.js";
import { pgliteDb } from "./pglite-db.test-helper.js";
import { DEMO_REPO_ID, seedMinimal } from "./seed.js";

// D-388: the approved rules of a local project added on this computer go into its mirror's main (a commit on the scanned
// base, fast-forward), not into a PR of the worker's one demo repo — so its tasks find .mandat.yml at the base.
const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
let db: Awaited<ReturnType<typeof pgliteDb>>;
const tmp = mkdtempSync(path.join(os.tmpdir(), "harness-local-"));
const src = path.join(tmp, "shop");
const mirror = path.join(tmp, "shop.git");
const git = (...a: string[]) => execFileSync("git", a, { env, encoding: "utf8" }).trim();
beforeAll(async () => {
  db = await pgliteDb();
  await seedMinimal(db, { remoteUrl: "file:///tmp/x.git", ownerEmail: "o@demo.invalid" });
  cpSync(path.join(repoRoot, "fixtures/demo-shop"), src, { recursive: true, filter: (p) => !p.includes("node_modules") });
  rmSync(path.join(src, ".mandat.yml"), { force: true });
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: src, env });
  execFileSync("git", ["add", "-A"], { cwd: src, env });
  execFileSync("git", ["commit", "-q", "-m", "shop"], { cwd: src, env });
  git("clone", "-q", "--bare", src, mirror);
  await db.query("update public.repos set remote_url = $2, full_name = 'local/shop' where id = $1", [DEMO_REPO_ID, `file://${mirror}`]);
});
afterAll(async () => {
  await db.end();
  rmSync(tmp, { recursive: true, force: true });
});

describe("rules of an own local project (D-388)", () => {
  it("approved → one commit on the scanned base in the mirror, main moves to it; again → nothing new; the worker's GitHub is untouched", async () => {
    const gh = fakeGitHub({ repos: { "mandat-demo/shop": {} } });
    const deps = { db, gh, ghRepo: "mandat-demo/shop", localGh: fakeGitHub({ autoRepos: true }) };
    const id = await scanForProposal(deps, DEMO_REPO_ID);
    const p = (await db.query<{ policy_yaml: string; yaml_sha256: string }>("select policy_yaml, yaml_sha256 from public.harness_proposals where id = $1", [id])).rows[0];
    const base = git("--git-dir", mirror, "rev-parse", "main");
    await db.query("update public.harness_proposals set status = 'approved', version = 1, generated = $2::jsonb where id = $1", [id, JSON.stringify([{ path: ".mandat.yml", content: p?.policy_yaml, sha256: p?.yaml_sha256, before: null }])]);
    await deliverHarnessPr(deps, id as string);
    const main = git("--git-dir", mirror, "rev-parse", "main");
    expect(git("--git-dir", mirror, "rev-parse", `${main}^`)).toBe(base);
    expect(git("--git-dir", mirror, "show", "main:.mandat.yml")).toBe(p?.policy_yaml.trim());
    await deliverHarnessPr(deps, id as string);
    expect(git("--git-dir", mirror, "rev-parse", "main")).toBe(main);
    expect(gh.state.calls).toEqual([]);
    expect((await db.query<{ kind: string }>("select kind from public.ledger where kind = 'delivered'")).rows).toHaveLength(1);
  });

  // live test (16.11.2026): the local demo project carries the worker's demo repo name, so its rules went to a PR in the
  // fake GitHub that nothing merges, while its tasks go into the mirror's main (D-367) — every next task was harness_stale
  it("the local demo project (the worker's demo name, provider local) gets its rules in the mirror too, no PR", async () => {
    await db.query("update public.repos set full_name = 'mandat-demo/shop' where id = $1", [DEMO_REPO_ID]);
    const gh = fakeGitHub({ repos: { "mandat-demo/shop": {} } });
    const deps = { db, gh, ghRepo: "mandat-demo/shop", localGh: fakeGitHub({ autoRepos: true }) };
    const id = await scanForProposal(deps, DEMO_REPO_ID);
    const p = (await db.query<{ policy_yaml: string; yaml_sha256: string }>("select policy_yaml, yaml_sha256 from public.harness_proposals where id = $1", [id])).rows[0];
    const before = git("--git-dir", mirror, "show", "main:.mandat.yml");
    const yaml = `${p?.policy_yaml.trim()}\n# v2\n`;
    await db.query("update public.harness_proposals set status = 'approved', version = 2, generated = $2::jsonb where id = $1", [id, JSON.stringify([{ path: ".mandat.yml", content: yaml, sha256: p?.yaml_sha256, before: `${before}\n` }])]);
    expect(await deliverHarnessPr(deps, id as string)).toBeNull();
    expect(git("--git-dir", mirror, "show", "main:.mandat.yml")).toBe(yaml.trim());
    expect(gh.state.calls).toEqual([]);
  });
});

// D-601: the profile proposed after the project's interview carries the approved brief in layer B
describe("the profile from the approved brief (D-601)", () => {
  it("a scan of a project with an approved brief puts the brief's summary, commands and boundaries in the new profile", async () => {
    const brief = { product: "An online shop for a bakery", users: ["customers"], works_today: ["checkout"], must_not_break: ["payments"], commands: { test: "pnpm test --run" }, stack: ["TypeScript"], approver: "Simo", budget_usd: 5, notes: [] };
    await db.query("update public.repos set brief = $2::jsonb, brief_hash = $3, brief_approved_at = now() where id = $1", [DEMO_REPO_ID, JSON.stringify(brief), `sha256:${"c".repeat(64)}`]);
    const deps = { db, gh: fakeGitHub({ repos: { "mandat-demo/shop": {} } }), ghRepo: "mandat-demo/shop", localGh: fakeGitHub({ autoRepos: true }) };
    await scanForProposal(deps, DEMO_REPO_ID);
    const p = (await db.query<{ layers: { b: { summary: string; commands: Record<string, string>; boundaries: string[] } }; sources: Record<string, string> }>("select layers, sources from public.harness_profiles where repo_id = $1 order by version desc limit 1", [DEMO_REPO_ID])).rows[0];
    expect(p?.layers.b.summary).toContain("An online shop for a bakery");
    expect(p?.layers.b.commands.test).toBe("pnpm test --run");
    expect(p?.layers.b.boundaries[0]).toBe("Must keep working: payments");
    expect(p?.sources["b.summary"]).toBe("human");
  });
});
