import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultRepoRoot } from "./cli.js";

describe("defaultRepoRoot", () => {
  it("points at the repo on every OS (D-414: on Windows a URL pathname gave C:\\C:\\…)", () => {
    expect(existsSync(path.join(defaultRepoRoot, "pnpm-workspace.yaml"))).toBe(true);
  });
});
