import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMcpArgs, resolveRepo, secretsInEnv } from "./args.js";

const tmp = () => mkdtempSync(path.join(os.tmpdir(), "mandat-allow-"));

describe("mcp-allowlist (D-214, F16)", () => {
  it("repo извън allowlist, `..`, symlink към /etc → repo not allowed; под allowlist → ok", () => {
    const t = tmp();
    mkdirSync(path.join(t, "shop/sub"), { recursive: true });
    mkdirSync(path.join(t, "other"));
    symlinkSync("/etc", path.join(t, "shop/etc-link"));
    const p = parseMcpArgs(["--allow", path.join(t, "shop"), "--remote", "file:///r.git"], {});
    if (!p.ok) throw new Error(p.error);
    const al = p.args.allowed;
    expect(resolveRepo(al, undefined)).toMatchObject({ ok: true, remote: "file:///r.git" });
    expect(resolveRepo(al, path.join(t, "shop/sub"))).toMatchObject({ ok: true });
    for (const bad of [path.join(t, "other"), path.join(t, "shop/../other"), path.join(t, "shop/etc-link"), "relative/path", path.join(t, "missing")]) {
      expect(resolveRepo(al, bad)).toEqual({ ok: false, error: "repo not allowed" });
    }
    expect(resolveRepo([], undefined)).toEqual({ ok: false, error: "repo not allowed" });
  });
  it("аргументи: празен allowlist, относителен, без remote, --allow-project-dir, --socket/--home абсолютни", () => {
    const t = tmp();
    expect(parseMcpArgs([], {})).toMatchObject({ ok: false });
    expect(parseMcpArgs(["--allow", ".", "--remote", "x"], {})).toMatchObject({ ok: false, error: expect.stringContaining("absolute") });
    expect(parseMcpArgs(["--allow", t], {})).toMatchObject({ ok: false, error: expect.stringContaining("--remote") });
    expect(parseMcpArgs(["--allow-project-dir", "--remote", "x"], {})).toMatchObject({ ok: false, error: expect.stringContaining("CLAUDE_PROJECT_DIR") });
    expect(parseMcpArgs(["--allow-project-dir", "--remote", "x"], { CLAUDE_PROJECT_DIR: t })).toMatchObject({ ok: true });
    expect(parseMcpArgs(["--allow", t, "--remote", "x", "--socket", "rel"], {})).toMatchObject({ ok: false });
    expect(parseMcpArgs(["--allow", t, "--remote", "x", "--home", "rel"], {})).toMatchObject({ ok: false });
    expect(parseMcpArgs(["--allow", t, "--remote", "-x"], {})).toMatchObject({ ok: false });
    expect(parseMcpArgs(["--allow", "/nonexistent-dir-x", "--remote", "x"], {})).toMatchObject({ ok: false });
    expect(parseMcpArgs(["--allow", t, "--remote", "x", "--bogus"], {})).toMatchObject({ ok: false });
    expect(parseMcpArgs(["--allow"], {})).toMatchObject({ ok: false });
    const ok = parseMcpArgs(["--allow", t, "--remote", "x", "--socket", "/run/x.sock", "--home", "/var/x", "--same-uid"], {});
    expect(ok).toMatchObject({ ok: true, args: { sameUid: true, socket: "/run/x.sock", home: "/var/x" } });
    expect(secretsInEnv({ SUPABASE_ANON_KEY: "x", GITHUB_OBSERVER_PRIVATE_KEY: "y", OPENAI_API_KEY: "z", PATH: "p" })).toEqual(["GITHUB_OBSERVER_PRIVATE_KEY", "OPENAI_API_KEY", "SUPABASE_ANON_KEY"]);
  });
});
