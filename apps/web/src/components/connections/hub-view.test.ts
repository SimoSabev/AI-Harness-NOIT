import { describe, expect, it } from "vitest";
import { connectionTiles } from "./hub-view";

// D-500: Settings → Connections — one place that shows what is connected (subscriptions, API keys, MCP/tools/skills,
// models, profile) and leads to each part. Pure: the page and the test share it.
describe("connections hub (D-500)", () => {
  const empty = { local: true, subscriptions: [], keys: [], servers: [], skills: [], models: 0, account: "off" as const };

  it("five tiles in a fixed order, each with its own page", () => {
    expect(connectionTiles(empty).map((t) => [t.id, t.href])).toEqual([
      ["subscriptions", "/settings/subscriptions"],
      ["api-keys", "/settings/api-keys"],
      ["tools", "/settings/tools"],
      ["models", "/settings/models"],
      ["account", "/settings/account"],
    ]);
  });

  it("nothing connected: every tile is empty, the account tile says sign-in is optional", () => {
    const t = connectionTiles(empty);
    expect(t.filter((x) => x.id !== "account").every((x) => x.state === "empty" && x.count === 0)).toBe(true);
    expect(t.find((x) => x.id === "account")).toMatchObject({ state: "optional", count: null });
  });

  it("counts only what works; an expired login or a server that failed vetting asks for attention", () => {
    const t = connectionTiles({
      ...empty,
      subscriptions: [{ status: "signed_in" }, { status: "signed_in" }, { status: "expired" }],
      keys: [{ hasKey: true, kind: "api_key" }, { hasKey: false, kind: "api_key" }, { hasKey: true, kind: "local" }, { hasKey: false, kind: "subscription" }],
      servers: [{ vet_status: "approved" }, { vet_status: "blocked" }, { vet_status: "pending" }],
      skills: [{ approved: true }, { approved: false }],
      models: 7,
      account: "signed_in",
    });
    const by = Object.fromEntries(t.map((x) => [x.id, x]));
    expect(by.subscriptions).toMatchObject({ count: 2, state: "attention" });
    // a key-less local server (Ollama) still counts: it is connected; a subscription row is not an API key
    expect(by["api-keys"]).toMatchObject({ count: 2, state: "ok" });
    expect(by.tools).toMatchObject({ count: 2, state: "attention" });
    expect(by.models).toMatchObject({ count: 7, state: "ok" });
    expect(by.account).toMatchObject({ state: "ok", count: null });
  });

  it("D-625: without a sync server the profile tile is not there at all", () => {
    expect(connectionTiles({ ...empty, account: "hidden" }).map((t) => t.id)).toEqual(["subscriptions", "api-keys", "tools", "models"]);
  });

  it("outside `pnpm local` the local parts are unavailable, never shown as empty", () => {
    const t = connectionTiles({ ...empty, local: false });
    expect(t.filter((x) => ["subscriptions", "api-keys", "models", "account"].includes(x.id)).every((x) => x.state === "unavailable")).toBe(true);
    expect(t.find((x) => x.id === "tools")?.state).toBe("empty");
  });
});
