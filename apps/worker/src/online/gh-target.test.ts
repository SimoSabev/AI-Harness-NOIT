import { describe, expect, it } from "vitest";
import { fakeGitHub } from "@mandat/gate-github";
import { ghFor } from "./gh-target.js";

// D-388: where the GitHub side of a project goes — its own repo, never the one demo repo of the worker.
describe("ghFor (D-388)", () => {
  const gh = fakeGitHub({ repos: { "mandat-demo/shop": {} } });
  const localGh = fakeGitHub({ autoRepos: true });
  const d = { gh, ghRepo: "mandat-demo/shop", localGh };
  it("the demo repo keeps the worker's GitHub (fake offline, the App online)", () => {
    expect(ghFor(d, { provider: "local", full_name: "mandat-demo/shop" })).toEqual({ gh, repo: "mandat-demo/shop", own: false });
  });
  it("a GitHub project goes to its own repo through the worker's GitHub", () => {
    expect(ghFor(d, { provider: "github", full_name: "simo/api" })).toEqual({ gh, repo: "simo/api", own: false });
  });
  it("a local project added on this computer: the offline GitHub only, under its own name; the mirror is its delivery", () => {
    expect(ghFor(d, { provider: "local", full_name: "local/shop" })).toEqual({ gh: localGh, repo: "local/shop", own: true });
  });
});
