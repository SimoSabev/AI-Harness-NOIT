import { describe, expect, it } from "vitest";
import { fakeGitHub } from "./fake.js";

// D-388: the worker's offline GitHub for local projects — a project added later needs no seed entry of its own.
describe("fakeGitHub autoRepos (D-388)", () => {
  it("an unknown repo is created on first use with the defaults; without autoRepos it stays a 404", async () => {
    const auto = fakeGitHub({ autoRepos: true });
    expect((await auto.getRules("local/shop", "main")).strict).toBe(true);
    const strict = fakeGitHub();
    expect(() => strict.getRules("local/shop", "main")).toThrow(/404 repo/);
  });
});
