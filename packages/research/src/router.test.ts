import { describe, expect, it } from "vitest";
import { routeRoles } from "./router.js";
import type { RouterChannel } from "./router.js";

const ch = (id: string, kind: RouterChannel["kind"], quality: number, cost: number, extra: Partial<RouterChannel> = {}): RouterChannel => ({ id, label: id, kind, model: id, enabled: true, health: "ok", quality, cost, ...extra });
const opus = ch("opus", "api_key", 0.95, 1);
const haiku = ch("haiku", "api_key", 0.7, 0.1);
const local = ch("qwen", "local", 0.6, 0);
const sub = ch("max", "cli_profile", 0.95, 0.05);

const primary = (r: ReturnType<typeof routeRoles>, role: string) => (r.ok ? r.routes.find((x) => x.role === role)?.channels[0]?.id : null);

describe("routing roles to models (D-404)", () => {
  it("balanced: the strong model plans and writes, the cheap one reads pages", () => {
    const r = routeRoles([opus, haiku], "balanced");
    expect(primary(r, "planner")).toBe("opus");
    expect(primary(r, "writer")).toBe("opus");
    expect(primary(r, "reader")).toBe("haiku");
    expect(primary(r, "triage")).toBe("haiku");
  });
  it("economy with a local model: the local model does the per-page work", () => {
    const r = routeRoles([opus, haiku, local], "economy");
    expect(primary(r, "reader")).toBe("qwen");
    expect(primary(r, "searcher")).toBe("qwen");
  });
  it("quality: the strong model everywhere it is clearly better", () => {
    const r = routeRoles([opus, haiku], "quality");
    expect(primary(r, "verifier")).toBe("opus");
    expect(primary(r, "analyst")).toBe("opus");
  });
  it("a subscription is cheap but slow per call: it writes, an API model reads pages", () => {
    const r = routeRoles([sub, haiku], "balanced");
    expect(primary(r, "writer")).toBe("max");
    expect(primary(r, "reader")).toBe("haiku");
  });
  it("every channel is a fallback, in order; down or disabled ones are left out", () => {
    const r = routeRoles([opus, haiku, ch("dead", "api_key", 1, 0, { health: "down" }), ch("off", "local", 1, 0, { enabled: false })], "balanced");
    expect(r.ok && r.routes.every((x) => x.channels.length === 2)).toBe(true);
  });
  it("a fixed channel wins for its role; a fixed channel that is down is an error", () => {
    const r = routeRoles([opus, haiku], "economy", { writer: "opus", reader: "opus" });
    expect(primary(r, "reader")).toBe("opus");
    expect(r.ok && r.routes.find((x) => x.role === "reader")?.fixed).toBe(true);
    expect(routeRoles([opus, ch("dead", "api_key", 1, 0, { health: "down" })], "economy", { writer: "dead" }).ok).toBe(false);
  });
  it("no usable channel → not ok with a reason", () => {
    const r = routeRoles([], "balanced");
    expect(r.ok).toBe(false);
  });
});
