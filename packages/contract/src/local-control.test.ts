import { describe, expect, it } from "vitest";
import { AccountName, LoginCode, LoginState, findLoginUrl } from "./local-control.js";

// D-369: the subscription login from the web — what crosses between `mandat local` and the web server.
const URL_LINE =
  "If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Aprofile+user%3Ainference&code_challenge=dOrnBj4eunAdU1pNf5Z48zl2N0ey-3bZnq1Hw28KOmc&code_challenge_method=S256&state=ZP5AE7SOhr6MAnRUjVCDFM6ovioLF77DJhoNMx1WEE0";

describe("local control: subscription login (D-369)", () => {
  it("findLoginUrl: the authorize address of Claude Code 2.1.302, also inside ANSI (OSC 8) links", () => {
    const want = URL_LINE.slice(URL_LINE.indexOf("https://"));
    expect(findLoginUrl(`Opening browser to sign in…\n${URL_LINE}\nPaste code here if prompted > `)).toBe(want);
    expect(findLoginUrl(`\x1b]8;;${want}\x07${want}\x1b]8;;\x07\r\n`)).toBe(want);
    expect(findLoginUrl("Opening browser to sign in…\n")).toBeNull();
  });
  it("findLoginUrl: only Anthropic's own hosts, https, an OAuth authorize path", () => {
    for (const bad of [
      "visit: https://evil.example/cai/oauth/authorize?code=true",
      "visit: https://claude.com.evil.example/oauth/authorize?x=1",
      "visit: http://claude.com/cai/oauth/authorize?code=true",
      "visit: https://claude.com/download",
      "visit: https://user@claude.com/cai/oauth/authorize?code=true",
    ]) expect(findLoginUrl(bad)).toBeNull();
    expect(findLoginUrl("visit: https://claude.ai/oauth/authorize?code=true")).toBe("https://claude.ai/oauth/authorize?code=true");
    expect(findLoginUrl("visit: https://console.anthropic.com/oauth/authorize?code=true")).toBe("https://console.anthropic.com/oauth/authorize?code=true");
  });
  it("names and codes: the profile volume's alphabet; a code is one printable line", () => {
    expect(AccountName.safeParse("lichno").success).toBe(true);
    for (const n of ["", "Work", "-x", "a b", "a".repeat(33)]) expect(AccountName.safeParse(n).success).toBe(false);
    expect(LoginCode.parse("  AbC-12_3#xYz.9~q  ")).toBe("AbC-12_3#xYz.9~q");
    for (const c of ["short", "has space inside", "line\nbreak", "x".repeat(600)]) expect(LoginCode.safeParse(c).success).toBe(false);
  });
  it("LoginState: a state machine the web can render; a waiting state needs an Anthropic address", () => {
    expect(LoginState.parse({ state: "idle" })).toEqual({ state: "idle" });
    expect(LoginState.safeParse({ state: "waiting_code", name: "lichno", url: "https://claude.com/cai/oauth/authorize?code=true" }).success).toBe(true);
    expect(LoginState.safeParse({ state: "waiting_code", name: "lichno", url: "https://evil.example/oauth/authorize?x" }).success).toBe(false);
    expect(LoginState.safeParse({ state: "done", name: "lichno", email: "s@example.com", plan: "Max" }).success).toBe(true);
    expect(LoginState.safeParse({ state: "failed", name: "lichno", reason: "invalid_code" }).success).toBe(true);
    expect(LoginState.safeParse({ state: "failed", name: "lichno", reason: "whatever" }).success).toBe(false);
  });
});
