import { describe, expect, it } from "vitest";
import { tuiModel, renderTui, visibleWidth } from "./commands/tui.js";
import type { TuiRow } from "./commands/tui.js";

const now = new Date("2026-10-21T18:00:00Z");
const r = (id: string, repo: string, col: number, o: Partial<TuiRow> = {}): TuiRow => ({ id, repo, text: `задача ${id}`, agent: "claude", col, last_result: null, updated_at: "2026-10-21T17:30:00Z", ...o });

describe("mandat tui (D-306)", () => {
  const rows = [
    r("a", "acme/shop", 4, { last_result: "VERIFIED" }), r("b", "acme/shop", 2), r("c", "acme/api", 5, { last_result: "FAILED" }),
    r("d", "acme/api", 3), r("e", "acme/docs", 7, { updated_at: "2026-10-21T10:00:00Z" }), r("f", "acme/docs", 7, { updated_at: "2026-10-18T10:00:00Z" }), r("g", "acme/shop", 1),
  ];
  it("потокът и проектите: провал първи, после чакащи, после работещи; рой само от живите", () => {
    const m = tuiModel(rows, now);
    expect(m.flow).toEqual({ queued: 1, running: 1, checking: 1, you: 2, done24h: 1 });
    expect(m.panes.map((p) => [p.name, p.health])).toEqual([["api", "bad"], ["shop", "warn"], ["docs", "idle"]]);
    expect(m.panes[1]?.lines.map((l) => l.id)).toEqual(["a", "b", "g"]);
    expect(m.swarm).toHaveLength(5);
  });
  it("без цвят: картата, роят, панелите и клавишите; всеки ред е най-много колкото терминала", () => {
    const out = renderTui(tuiModel(rows, now), { width: 100, height: 30, color: false, focus: 0 });
    const lines = out.split("\n");
    expect(out).toContain("tasks 1");
    expect(out).toContain("you 2");
    expect(out).toContain("[1] api");
    expect(out).toContain("FAILED");
    expect(out).toContain("q quit");
    expect(/[\u0400-\u04FF]/.test(out.replace(/задача \w/g, ""))).toBe(false);
    expect(out).not.toContain("\u001b[");
    for (const l of lines) expect(visibleWidth(l)).toBeLessThanOrEqual(100);
    expect(lines.length).toBeLessThanOrEqual(30);
  });
  it("с цвят: ANSI 24-bit, а ширината не брои escape кодовете", () => {
    const out = renderTui(tuiModel(rows, now), { width: 80, height: 24, color: true, focus: 1 });
    expect(out).toContain("\u001b[38;2;");
    for (const l of out.split("\n")) expect(visibleWidth(l)).toBeLessThanOrEqual(80);
  });
  it("празно: казва как да дадеш задача", () => {
    expect(renderTui(tuiModel([], now), { width: 60, height: 20, color: false, focus: 0 })).toContain("No tasks yet");
  });
  it("на български (MANDAT_LANG=bg): същата карта с думите от каталога (E7е)", () => {
    const out = renderTui(tuiModel(rows, now), { width: 100, height: 30, color: false, focus: 0, lang: "bg" });
    expect(out).toContain("задачи 1");
    expect(out).toContain("ти 2");
    expect(out).toContain("ПРОВАЛ");
    expect(out).toContain("q изход");
    expect(renderTui(tuiModel([], now), { width: 60, height: 20, color: false, focus: 0, lang: "bg" })).toContain("Още няма задачи");
  });
});
