import { describe, expect, it } from "vitest";
import { parseClaudeStatus, subscriptionLabel } from "./commands/accounts.js";

// D-295: what `claude auth status --json` tells about a profile (no token is ever read).
describe("accounts (D-295)", () => {
  it("subscriptionLabel (from T3 Code, MIT)", () => {
    expect(subscriptionLabel("claude_max_20x_subscription")).toBe("Max 20x");
    expect(subscriptionLabel("max5")).toBe("Max 5x");
    expect(subscriptionLabel("pro")).toBe("Pro");
    expect(subscriptionLabel("some_new_plan")).toBe("Some New Plan");
    expect(subscriptionLabel(undefined)).toBe(null);
  });
  it("parseClaudeStatus: logged out / logged in / junk", () => {
    expect(parseClaudeStatus('{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty"}')).toEqual({ loggedIn: false, email: null, plan: null });
    expect(parseClaudeStatus('{"loggedIn":true,"authMethod":"claude.ai","email":"s@example.com","subscriptionType":"max","configDirectory":"/x"}')).toEqual({ loggedIn: true, email: "s@example.com", plan: "Max" });
    expect(parseClaudeStatus("not json")).toEqual({ loggedIn: false, email: null, plan: null });
  });
});

describe("accounts commands with a fake docker (D-295)", () => {
  type Rule = (a: string[]) => { exit?: number; out?: string } | undefined;
  const fake = (rules: Rule[], calls: string[][] = []) => ({
    docker: {
      run(args: string[], o: { onStdout?: (b: Buffer) => void }) {
        calls.push(args);
        for (const r of rules) {
          const x = r(args);
          if (x) {
            if (x.out) o.onStdout?.(Buffer.from(x.out));
            return Promise.resolve({ exitCode: x.exit ?? 0, timedOut: false });
          }
        }
        return Promise.resolve({ exitCode: 0, timedOut: false });
      },
    },
    healthz: () => Promise.resolve({ ok: true, status: 200 }), procVersion: () => "", toolVersion: () => Promise.resolve("2.47.1"), nodeVersion: "24.22.0", bootProxy: () => Promise.resolve(true),
  });
  const io = () => {
    const o = { out: "", err: "" };
    return { o, io: { stdout: (s: string) => void (o.out += s), stderr: (s: string) => void (o.err += s), env: {}, cwd: process.cwd() } };
  };
  it("accounts: lists the profile volumes with their status; json; empty", async () => {
    const { accountsCommand, listAccounts } = await import("./commands/accounts.js");
    const d = fake([
      (a) => (a[0] === "volume" && a[1] === "ls" ? { out: "mandat-profile-claude-work\nmandat-profile-claude-lichno\nother-volume\n" } : undefined),
      (a) => (a.includes("status") && a.some((x) => x.startsWith("mandat-profile-claude-work:")) ? { out: '{"loggedIn":true,"email":"w@example.com","subscriptionType":"max"}' } : undefined),
      (a) => (a.includes("status") ? { out: '{"loggedIn":false}' } : undefined),
    ]);
    expect(await listAccounts(d as never)).toEqual([
      { name: "work", agent: "claude@work", loggedIn: true, email: "w@example.com", plan: "Max" },
      { name: "lichno", agent: "claude@lichno", loggedIn: false, email: null, plan: null },
    ]);
    const a = io();
    expect(await accountsCommand(a.io, d as never, { json: false })).toBe(0);
    expect(a.o.out).toContain("w@example.com · Max");
    const b = io();
    await accountsCommand(b.io, fake([(x) => (x[0] === "volume" ? { out: "" } : undefined)]) as never, { json: false });
    expect(b.o.out).toContain("pnpm mandat login");
    const j = io();
    await accountsCommand(j.io, d as never, { json: true });
    expect(JSON.parse(j.o.out).accounts).toHaveLength(2);
  });
  it("logout removes the volume; login without the image → 3 (no login is started)", async () => {
    const { loginCommand, logoutCommand } = await import("./commands/accounts.js");
    const calls: string[][] = [];
    const a = io();
    expect(await logoutCommand(a.io, fake([], calls) as never, { name: "work" })).toBe(0);
    expect(calls.some((c) => c[0] === "volume" && c[1] === "rm" && c[2] === "mandat-profile-claude-work")).toBe(true);
    const b = io();
    expect(await logoutCommand(b.io, fake([(x) => (x[0] === "volume" ? { exit: 1 } : undefined)]) as never, { name: "work" })).toBe(3);
    const c = io();
    expect(await loginCommand(c.io, fake([(x) => (x[0] === "image" ? { exit: 1 } : undefined)]) as never, { name: "work" })).toBe(3);
    expect(c.o.err).toContain("E_IMAGES_MISSING");
  });
});
