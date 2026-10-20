import { describe, expect, it } from "vitest";
import { selectChannel } from "./select.js";
import { ch } from "./select.test-helper.js";

const now = new Date("2026-10-20T12:00:00Z");
const auto = { mode: "auto" as const, channel_id: null, fallback_ids: [] };

describe("select-channel (Ф3 П4)", () => {
  it("формулата 0.5·Q + 0.3·(1 − C) + 0.2·H", () => {
    const r = selectChannel([ch({ id: "a", quality: 0.9, cost: 0.5 }), ch({ id: "b", quality: 0.8, cost: 0.1, provider: "openai" })], { estCostUsd: 0.5, rule: auto, now });
    // a: 0.45 + 0.15 + 0.2 = 0.80; b: 0.40 + 0.27 + 0.2 = 0.87
    expect(r.ok && [r.channel.id, r.reason]).toEqual(["b", { Q: 0.8, C: 0.1, H: 1, score: 0.87, rule: "auto" }]);
  });
  it("филтри: health, cooldown, бюджет < est × 1.5, изключен, cli_profile n/a", () => {
    const r = selectChannel(
      [ch({ id: "down", health: "down" }), ch({ id: "cool", cooldown_until: "2026-10-20T13:00:00Z" }), ch({ id: "poor", budget_usd_day: 1, spent_today_usd: 0.5 }), ch({ id: "off", enabled: false }), ch({ id: "sub", kind: "cli_profile" })],
      { estCostUsd: 0.5, rule: auto, now },
    );
    expect(r).toEqual({ ok: false, excluded: [{ label: "down", why: "health down" }, { label: "cool", why: "cooldown" }, { label: "poor", why: "budget" }, { label: "off", why: "disabled" }, { label: "sub", why: "cli_profile n/a in this prompt" }] });
    expect(selectChannel([ch({ id: "past", cooldown_until: "2026-10-20T11:00:00Z" })], { estCostUsd: 0.5, rule: auto, now }).ok).toBe(true);
  });
  it("равенство → least-used → label; fixed правило", () => {
    const r = selectChannel([ch({ id: "x", used_today: 5 }), ch({ id: "y", used_today: 2 }), ch({ id: "z", used_today: 2 })], { estCostUsd: 0.1, rule: auto, now });
    expect(r.ok && r.channel.id).toBe("y");
    const f = selectChannel([ch({ id: "x" }), ch({ id: "y", quality: 1 })], { estCostUsd: 0.1, rule: { mode: "fixed", channel_id: "x", fallback_ids: [] }, now });
    expect(f.ok && [f.channel.id, f.reason.rule]).toEqual(["x", "fixed"]);
  });
});
