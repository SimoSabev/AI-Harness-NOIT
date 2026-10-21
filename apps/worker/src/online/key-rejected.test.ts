import { describe, expect, it } from "vitest";
import { keyRejected } from "./daemon.js";

// D-293: a rejected key is the reason, not "no change" and not the agent's failure.
describe("keyRejected (D-293)", () => {
  it("only when the proxy saw 401/403 and no real change was verified", () => {
    expect(keyRejected({ authFailed: true, result: "VERIFIED", emptyChange: true })).toBe(true);
    expect(keyRejected({ authFailed: true, result: "UNKNOWN", emptyChange: false })).toBe(true);
    expect(keyRejected({ authFailed: true, result: "FAILED", emptyChange: true })).toBe(true);
    expect(keyRejected({ authFailed: true, result: "VERIFIED", emptyChange: false })).toBe(false);
    expect(keyRejected({ authFailed: false, result: "VERIFIED", emptyChange: true })).toBe(false);
  });
});
