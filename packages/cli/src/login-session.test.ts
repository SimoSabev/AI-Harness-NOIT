import { describe, expect, it } from "vitest";
import { LoginSessions } from "./commands/login-session.js";
import type { LoginProc } from "./commands/login-session.js";

// D-369: `claude auth login` from the web — one session at a time, the code goes to stdin only, the state is all the web sees.
const URL = "https://claude.com/cai/oauth/authorize?code=true&code_challenge=x&code_challenge_method=S256&state=y";

function fakeProc() {
  const written: string[] = [];
  let out: (s: string) => void = () => undefined;
  let exit: (code: number | null) => void = () => undefined;
  let killed = false;
  const proc: LoginProc = {
    onOutput: (f) => void (out = f),
    onExit: (f) => void (exit = f),
    write: (s) => void written.push(s),
    kill: () => {
      killed = true;
      exit(null);
    },
  };
  return { proc, written, emit: (s: string) => out(s), exit: (c: number | null) => exit(c), killed: () => killed };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(o: { prepare?: "ok" | "created" | "images_missing" | "failed"; loggedIn?: boolean; timeoutMs?: number } = {}) {
  const p = fakeProc();
  const spawned: string[] = [];
  const discarded: string[] = [];
  const s = new LoginSessions({
    prepare: async () => o.prepare ?? "ok",
    discard: async (name) => void discarded.push(name),
    spawn: (name) => {
      spawned.push(name);
      return p.proc;
    },
    status: async () => ({ loggedIn: o.loggedIn ?? true, email: "s@example.com", plan: "Max" }),
    timeoutMs: o.timeoutMs ?? 60_000,
  });
  return { s, p, spawned, discarded };
}

describe("LoginSessions (D-369)", () => {
  it("start → waiting_code with Anthropic's address → the code to stdin → done with the account", async () => {
    const { s, p, spawned } = setup();
    expect(s.state()).toEqual({ state: "idle" });
    expect(await s.start("lichno")).toEqual({ state: "starting", name: "lichno" });
    await tick();
    expect(spawned).toEqual(["lichno"]);
    p.emit("Opening browser to sign in…\nIf the browser didn't open, visit: ");
    expect(s.state()).toEqual({ state: "starting", name: "lichno" });
    p.emit(`${URL}\nPaste code here if prompted > `);
    expect(s.state()).toEqual({ state: "waiting_code", name: "lichno", url: URL });
    expect(s.submit("  AbC-12_3#xYz  ")).toEqual({ state: "checking", name: "lichno" });
    expect(p.written).toEqual(["AbC-12_3#xYz\n"]);
    p.exit(0);
    await tick();
    expect(s.state()).toEqual({ state: "done", name: "lichno", email: "s@example.com", plan: "Max" });
  });
  it("a wrong code: Claude Code says so → failed invalid_code, the process is stopped", async () => {
    const { s, p } = setup();
    await s.start("lichno");
    await tick();
    p.emit(`visit: ${URL}\nPaste code here if prompted > `);
    s.submit("WRONGCODE123");
    p.emit("Invalid code. Please make sure the full code was copied.");
    expect(s.state()).toEqual({ state: "failed", name: "lichno", reason: "invalid_code" });
    expect(p.killed()).toBe(true);
  });
  it("one at a time; a bad name or code is refused; submit without waiting_code is refused", async () => {
    const { s, p } = setup();
    await expect(s.start("Bad Name")).rejects.toThrow();
    expect(s.submit("AbC-12_3#xYz")).toBeNull();
    await s.start("lichno");
    expect(await s.start("other")).toEqual({ state: "failed", name: "other", reason: "busy" });
    await tick();
    p.emit(`visit: ${URL}\n`);
    expect(s.submit("short")).toBeNull();
    expect(p.written).toEqual([]);
  });
  it("cancel stops the process; a finished session can be started again", async () => {
    const { s, p } = setup();
    await s.start("lichno");
    await tick();
    expect(s.cancel()).toEqual({ state: "failed", name: "lichno", reason: "cancelled" });
    expect(p.killed()).toBe(true);
    expect(await s.start("lichno")).toEqual({ state: "starting", name: "lichno" });
  });
  it("no images → failed images_missing, nothing spawned; exit without a login → not_logged_in; exit before an address → no_url", async () => {
    const a = setup({ prepare: "images_missing" });
    await a.s.start("lichno");
    await tick();
    expect(a.s.state()).toEqual({ state: "failed", name: "lichno", reason: "images_missing" });
    expect(a.spawned).toEqual([]);
    const b = setup({ loggedIn: false });
    await b.s.start("lichno");
    await tick();
    b.p.emit(`visit: ${URL}\n`);
    b.s.submit("AbC-12_3#xYz");
    b.p.exit(1);
    await tick();
    expect(b.s.state()).toEqual({ state: "failed", name: "lichno", reason: "not_logged_in" });
    const c = setup();
    await c.s.start("lichno");
    await tick();
    c.p.exit(1);
    await tick();
    expect(c.s.state()).toEqual({ state: "failed", name: "lichno", reason: "no_url" });
  });
  it("a forgotten session times out and is stopped", async () => {
    const { s, p } = setup({ timeoutMs: 20 });
    await s.start("lichno");
    await tick();
    p.emit(`visit: ${URL}\n`);
    await new Promise((r) => setTimeout(r, 40));
    expect(s.state()).toEqual({ state: "failed", name: "lichno", reason: "timeout" });
    expect(p.killed()).toBe(true);
  });
  it("a new account whose login does not finish is removed again; an existing one (re-login) and a finished one stay", async () => {
    const a = setup({ prepare: "created" });
    await a.s.start("probe");
    await tick();
    a.p.emit(`visit: ${URL}\n`);
    a.s.cancel();
    await tick();
    expect(a.discarded).toEqual(["probe"]);
    const b = setup({ prepare: "ok" });
    await b.s.start("lichno");
    await tick();
    b.s.cancel();
    await tick();
    expect(b.discarded).toEqual([]);
    const c = setup({ prepare: "created", loggedIn: true });
    await c.s.start("new");
    await tick();
    c.p.emit(`visit: ${URL}\n`);
    c.s.submit("AbC-12_3#xYz");
    c.p.exit(0);
    await tick();
    expect(c.s.state().state).toBe("done");
    expect(c.discarded).toEqual([]);
    const d = setup({ prepare: "created", loggedIn: false });
    await d.s.start("new");
    await tick();
    d.p.emit(`visit: ${URL}\n`);
    d.s.submit("AbC-12_3#xYz");
    d.p.exit(1);
    await tick();
    await tick();
    expect(d.s.state()).toMatchObject({ state: "failed", reason: "not_logged_in" });
    expect(d.discarded).toEqual(["new"]);
  });
});
