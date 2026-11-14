import { describe, expect, it } from "vitest";
import { toolInvocation } from "./deps.js";

// D-515: on Windows pnpm is pnpm.cmd, which execFile finds only through the shell; doctor said "pnpm missing".
describe("toolInvocation (D-515)", () => {
  it("git never needs the shell", () => {
    expect(toolInvocation("git", "win32")).toEqual({ file: "git", args: ["--version"], shell: false });
    expect(toolInvocation("git", "darwin")).toEqual({ file: "git", args: ["--version"], shell: false });
  });
  it("pnpm runs through the shell on Windows only", () => {
    expect(toolInvocation("pnpm", "win32")).toEqual({ file: "pnpm", args: ["-v"], shell: true });
    expect(toolInvocation("pnpm", "linux")).toEqual({ file: "pnpm", args: ["-v"], shell: false });
  });
});
