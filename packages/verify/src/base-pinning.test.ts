import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readAtBase, resolveTrustedBase } from "./trusted-base.js";
import { remoteAndClone, sh } from "./git-fixture.test-helper.js";

// S1 / D-232 (base-pinning).
const home = () => mkdtempSync(path.join(os.tmpdir(), "mandat-home-"));
const tmpHome = () => mkdtempSync(path.join(os.tmpdir(), "mandat-git-"));

describe("доверен base", () => {
  it("нормален случай: base = merge-base с доверения връх", async () => {
    const f = remoteAndClone({ "a.txt": "1\n", ".mandat.yml": "version: 2\n" });
    writeFileSync(path.join(f.repo, "a.txt"), "2\n");
    sh(f.repo, "commit", "-qam", "change");
    const r = await resolveTrustedBase({ repo: f.repo, remote: `file://${f.remote}`, home: home(), tmpHome: tmpHome() });
    expect(r).toMatchObject({ ok: true, branch: "main", baseSha: f.base, trustedTip: f.base });
    if (r.ok) expect((await readAtBase({ mirror: r.mirror, baseSha: r.baseSha, file: ".mandat.yml", tmpHome: tmpHome() }))?.toString()).toBe("version: 2\n");
  });
  it("агентът е на default клона → UNKNOWN on_default_branch", async () => {
    const f = remoteAndClone({ "a.txt": "1\n" });
    sh(f.repo, "checkout", "-q", "main");
    writeFileSync(path.join(f.repo, "a.txt"), "2\n");
    sh(f.repo, "commit", "-qam", "on main");
    expect(await resolveTrustedBase({ repo: f.repo, remote: f.remote, home: home(), tmpHome: tmpHome() })).toMatchObject({ ok: false, reason: "on_default_branch" });
  });
  it("update-ref refs/remotes/origin/main + смяна на remote.origin.url → base е пак от доверения remote", async () => {
    const f = remoteAndClone({ "a.txt": "1\n", ".mandat.yml": "trusted\n" });
    writeFileSync(path.join(f.repo, ".mandat.yml"), "evil\n");
    sh(f.repo, "commit", "-qam", "evil base");
    const evil = sh(f.repo, "rev-parse", "HEAD");
    writeFileSync(path.join(f.repo, "a.txt"), "2\n");
    sh(f.repo, "commit", "-qam", "change");
    sh(f.repo, "update-ref", "refs/remotes/origin/main", evil);
    sh(f.repo, "remote", "set-url", "origin", "/nonexistent");
    const r = await resolveTrustedBase({ repo: f.repo, remote: f.remote, home: home(), tmpHome: tmpHome() });
    expect(r).toMatchObject({ ok: true, baseSha: f.base });
    if (r.ok) expect((await readAtBase({ mirror: r.mirror, baseSha: r.baseSha, file: ".mandat.yml", tmpHome: tmpHome() }))?.toString()).toBe("trusted\n");
  });
  it("без --remote → no_remote; несъщ. remote → fetch_failed; без общ предшественик → no_merge_base; не е repo", async () => {
    const f = remoteAndClone({ "a.txt": "1\n" });
    expect(await resolveTrustedBase({ repo: f.repo, remote: null, home: home(), tmpHome: tmpHome() })).toMatchObject({ ok: false, reason: "no_remote" });
    expect(await resolveTrustedBase({ repo: f.repo, remote: "/nope.git", home: home(), tmpHome: tmpHome() })).toMatchObject({ ok: false, reason: "fetch_failed" });
    expect(await resolveTrustedBase({ repo: f.repo, remote: "--upload-pack=x", home: home(), tmpHome: tmpHome() })).toMatchObject({ ok: false, reason: "bad_ref" });
    const other = remoteAndClone({ "b.txt": "x\n" });
    expect(await resolveTrustedBase({ repo: f.repo, remote: other.remote, home: home(), tmpHome: tmpHome() })).toMatchObject({ ok: false, reason: "no_merge_base" });
    expect(await resolveTrustedBase({ repo: os.tmpdir(), remote: f.remote, home: home(), tmpHome: tmpHome() })).toMatchObject({ ok: false, reason: "not_a_repo" });
    expect(await readAtBase({ mirror: f.remote, baseSha: "HEAD", file: "a.txt", tmpHome: tmpHome() })).toBe(null);
  });
});
