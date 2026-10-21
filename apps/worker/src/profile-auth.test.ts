import { describe, expect, it } from "vitest";
import { looksLikeLoginProblem } from "./run.js";

// D-295: with a profile the proxy sees nothing; a missing/expired login is read from the CLI's own output.
describe("looksLikeLoginProblem (D-295)", () => {
  it("the known login messages → true; normal output → false", () => {
    for (const l of ["Not logged in · Please run /login", '{"type":"result","is_error":true,"result":"OAuth token has expired"}', "API Error: 401 {\"type\":\"error\",\"error\":{\"type\":\"authentication_error\"}}", "Invalid API key · Please run /login", "Login expired · Please run /login"]) expect(looksLikeLoginProblem(l)).toBe(true);
    for (const l of ['{"type":"assistant","message":"fixed the login form"}', "tests passed"]) expect(looksLikeLoginProblem(l)).toBe(false);
  });
});
