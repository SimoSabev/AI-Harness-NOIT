import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildRunArgs } from "@mandat/sandbox";
import { buildFixture } from "../fixtures.js";
import { repoRoot } from "../testing.js";
import { deliverLocal } from "./deliver-local.js";
import { commitSigningKey, ensureSigningKey } from "./signing.js";

// E9f (v5 5.6, D-661): a commit Mandat makes for local apply is signed with the harness's SSH key, made and kept outside
// the sandbox ($MANDAT_HOME/keys, 0600). The key never goes into a sandbox and is never printed; gitsign/Rekor is M3.
const hasKeygen = (() => {
  try {
    execFileSync("ssh-keygen", ["-?"], { stdio: "ignore" });
    return true;
  } catch (e) {
    return (e as { status?: number }).status !== undefined; // `-?` exits non-zero but the binary is there
  }
})();
const env = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const patchOf = (mirror: string): Buffer => {
  const w = path.join(mkdtempSync(path.join(os.tmpdir(), "mandat-sig-agent-")), "w");
  execFileSync("git", ["clone", "-q", mirror, w], { env });
  execFileSync("git", ["apply"], { cwd: w, env, input: readFileSync(path.join(repoRoot, "demo/recordings/scene1-task1.patch")) });
  return execFileSync("git", ["diff", "--binary"], { cwd: w, env });
};

// D-661: without ssh-keygen (OpenSSH) Mandat does not sign, so there is nothing to test
describe.skipIf(!hasKeygen)("commit signing (D-661)", () => {
  it("the key is made once in $MANDAT_HOME/keys (dir 0700, key 0600) with its .pub and allowed_signers", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "mandat-sig-"));
    const a = await ensureSigningKey(home);
    expect(a.key).toBe(path.join(home, "keys", "commit-signing-ed25519"));
    expect(statSync(path.join(home, "keys")).mode & 0o777).toBe(0o700);
    expect(statSync(a.key).mode & 0o777).toBe(0o600);
    expect(readFileSync(`${a.key}.pub`, "utf8")).toMatch(/^ssh-ed25519 \S+ mandat-harness\n?$/);
    expect(readFileSync(a.allowedSigners, "utf8")).toMatch(/^mandat@localhost namespaces="git" ssh-ed25519 \S+/);
    const before = readFileSync(a.key);
    const b = await ensureSigningKey(home);
    expect(b).toEqual(a);
    expect(readFileSync(b.key)).toEqual(before);
  });
  it("deliverLocal with the key → a commit git verifies as good (G) with the allowed signers; without → unsigned (N)", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "mandat-sig-"));
    const fx = buildFixture({ repoRoot, mandatHome: home, force: false, name: "demo-shop" });
    const k = await ensureSigningKey(home);
    const patch = patchOf(fx.mirror);
    const signed = await deliverLocal({ mirror: fx.mirror, taskId: "t_sig", attempt: 1, baseSha: fx.sha, patch, message: "fix: x\n\nMandat-Task: t_sig", signingKey: k.key });
    const plain = await deliverLocal({ mirror: fx.mirror, taskId: "t_sig", attempt: 2, baseSha: fx.sha, patch, message: "fix: x\n\nMandat-Task: t_sig" });
    if (!signed.ok || !plain.ok) throw new Error("not delivered");
    const git = (...a: string[]) => execFileSync("git", ["--git-dir", fx.mirror, "-c", `gpg.ssh.allowedSignersFile=${k.allowedSigners}`, ...a], { env, encoding: "utf8" }).trim();
    expect(git("log", "-1", "--format=%G? %GS", signed.sha)).toBe("G mandat@localhost");
    expect(git("log", "-1", "--format=%G?", plain.sha)).toBe("N");
  });
  it("MANDAT_SIGN_COMMITS=0 → no key (and none is made); otherwise the path; a broken ssh-keygen → null, never a throw", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "mandat-sig-"));
    expect(await commitSigningKey(home, { MANDAT_SIGN_COMMITS: "0" })).toBeNull();
    expect(existsSync(path.join(home, "keys"))).toBe(false);
    expect(await commitSigningKey(home, {})).toBe(path.join(home, "keys", "commit-signing-ed25519"));
    const other = mkdtempSync(path.join(os.tmpdir(), "mandat-sig-"));
    expect(await commitSigningKey(other, {}, { keygen: "/nonexistent/ssh-keygen" })).toBeNull();
  });
  it("the key can never be mounted into a sandbox (only ro files under the run's etc/ may be, D-066)", async () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "mandat-sig-"));
    const k = await ensureSigningKey(home);
    const spec = { name: "mandat-x", runId: "r_01HZZZZZZZZZZZZZZZZZZZZZZZ", role: "agent", user: "1000:1000", network: "none", image: "x", publicEnv: {}, envNames: [], mounts: [{ kind: "bind", source: k.key, target: "/tmp/k", readonly: true }] };
    expect(() => buildRunArgs(spec as never, { home: os.homedir(), mandatHome: home, runDir: path.join(home, "runs", "r") })).toThrow(/bind/);
    for (const dir of [path.dirname(k.key)]) expect(() => buildRunArgs({ ...spec, mounts: [{ kind: "bind", source: dir, target: "/tmp/k", readonly: true }] } as never, { home: os.homedir(), mandatHome: home, runDir: path.join(home, "runs", "r") })).toThrow();
  });
});
