import { describe, expect, it } from "vitest";
import { DEFAULT_FEED, updateFeed } from "./updater.js";

describe("auto-update is off unless a feed is configured (E9g A5, D-376, Q-054)", () => {
  it("nothing set → off; dev → always off", () => {
    expect(updateFeed({}, true)).toBeNull();
    expect(updateFeed({ MANDAT_UPDATE_FEED: "  " }, true)).toBeNull();
    expect(updateFeed({ MANDAT_UPDATE_FEED: "github" }, false)).toBeNull();
  });
  it("github → GitHub Releases of SimoSabev/AI-Harness-NOIT (Q-054)", () => {
    expect(updateFeed({ MANDAT_UPDATE_FEED: "github" }, true)).toEqual({ provider: "github", owner: "SimoSabev", repo: "AI-Harness-NOIT" });
    expect(DEFAULT_FEED.owner).toBe("SimoSabev");
  });
  it("an https URL → a generic feed; http, file and junk → off", () => {
    expect(updateFeed({ MANDAT_UPDATE_FEED: "https://dl.example.org/harness" }, true)).toEqual({ provider: "generic", url: "https://dl.example.org/harness" });
    expect(updateFeed({ MANDAT_UPDATE_FEED: "http://dl.example.org/harness" }, true)).toBeNull();
    expect(updateFeed({ MANDAT_UPDATE_FEED: "file:///tmp/x" }, true)).toBeNull();
    expect(updateFeed({ MANDAT_UPDATE_FEED: "yes" }, true)).toBeNull();
  });
});
