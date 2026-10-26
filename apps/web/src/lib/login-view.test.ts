import { describe, expect, it } from "vitest";
import { loginView } from "./login-view";

// D-369: what the Accounts page shows for each state of the subscription login.
describe("loginView (D-369)", () => {
  it("form when nothing runs; wait while it starts or checks; the link and the code field while it waits for the code", () => {
    expect(loginView({ state: "idle" })).toEqual({ show: "form", poll: false, note: null });
    expect(loginView({ state: "starting", name: "lichno" })).toEqual({ show: "wait", poll: true, note: "keys.login.starting" });
    expect(loginView({ state: "waiting_code", name: "lichno", url: "https://claude.com/cai/oauth/authorize?code=true" })).toEqual({ show: "code", poll: true, note: null });
    expect(loginView({ state: "checking", name: "lichno" })).toEqual({ show: "wait", poll: true, note: "keys.login.checking" });
  });
  it("done → the form again with the result; failed → the form with why (every reason has a text)", () => {
    expect(loginView({ state: "done", name: "lichno", email: "s@example.com", plan: "Max" })).toEqual({ show: "form", poll: false, note: "keys.login.done" });
    for (const reason of ["busy", "images_missing", "start_failed", "no_url", "invalid_code", "not_logged_in", "timeout", "cancelled"] as const) {
      expect(loginView({ state: "failed", name: "lichno", reason })).toEqual({ show: "form", poll: false, note: `keys.login.fail.${reason}` });
    }
  });
});

describe("loginView with ChatGPT (D-393)", () => {
  it("waiting_device → the page and the code to type there, and keep asking", () => {
    expect(loginView({ state: "waiting_device", name: "rabota", url: "https://auth.openai.com/codex/device", code: "ABCD-12EFG" })).toEqual({ show: "device", poll: true, note: null });
  });
});
