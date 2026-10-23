import { describe, expect, it } from "vitest";
import { AccountName, DoctorReport, JobState, LedgerReport, LoginCode, LoginState, SYSTEM_JOB_ARGV, StatsReport, SystemJob, findLoginUrl, jobLines } from "./local-control.js";

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

describe("local control: system jobs (D-370)", () => {
  it("a closed list of jobs, each a fixed mandat argv; nothing from the web reaches the argv except the local org", () => {
    expect(SystemJob.options).toEqual(["doctor", "images", "images-ui", "fixtures", "fixtures-force", "stats", "verify-log"]);
    expect(SYSTEM_JOB_ARGV.fixtures).toEqual([["fixtures", "build"], ["fixtures", "build", "--name", "demo-shop"]]);
    expect(SystemJob.safeParse("run").success).toBe(false);
  });
  it("jobLines: docker progress (\\r), colours and other control characters out; long lines cut", () => {
    expect(jobLines("\x1b[1m#5 [2/7] RUN apt-get\x1b[0m\r#5 0.31 ok\n\n  done  \n")).toEqual(["#5 [2/7] RUN apt-get", "#5 0.31 ok", "  done"]);
    expect(jobLines("a\x07b\x00c")).toEqual(["abc"]);
    expect(jobLines("x".repeat(600))[0]).toHaveLength(500);
  });
  it("JobState and the reports the page reads", () => {
    expect(JobState.safeParse({ job: "doctor", state: "ok", started_at: "2026-10-23T20:00:00.000Z", finished_at: "2026-10-23T20:00:02.000Z", exit: 0, lines: [], result: { checks: [], exit: 0 } }).success).toBe(true);
    expect(JobState.safeParse({ job: "doctor", state: "ok", started_at: null, finished_at: null, exit: 0, lines: Array(201).fill("x"), result: null }).success).toBe(false);
    expect(DoctorReport.safeParse({ checks: [{ name: "node", ok: false, detail: "26.4.0" }], exit: 3 }).success).toBe(true);
    expect(StatsReport.safeParse({ total: 3, byResult: { VERIFIED: 3, UNKNOWN: 0, FAILED: 0 }, unknownShare: 0, topReasons: [], meanUsd: 0, meanMinutes: 0.5, byAgent: {} }).success).toBe(true);
    expect(LedgerReport.safeParse({ ok: true, count: 12, lastHash: "sha256:x" }).success).toBe(true);
  });
});
