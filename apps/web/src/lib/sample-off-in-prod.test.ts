import { describe, expect, it } from "vitest";
import { parseSample } from "./prefs";
import { terminalLines } from "./workbench";

describe("labelled samples are off in production by default (E7д, U4, D-332)", () => {
  it("no cookie: on in development, off in production; the cookie always wins", () => {
    expect(parseSample(undefined, "development")).toBe(true);
    expect(parseSample(undefined, "production")).toBe(false);
    expect(parseSample("1", "production")).toBe(true);
    expect(parseSample("0", "development")).toBe(false);
  });
});

describe("terminal lines (E7д)", () => {
  it("keeps order, caps at 50 000, marks the kind", () => {
    const rows = Array.from({ length: 50_010 }, (_, i) => ({ seq: i, kind: i === 0 ? "init" : "text", text: `l${i}` }));
    const t = terminalLines(rows);
    expect(t).toHaveLength(50_000);
    expect(t[0]).toEqual({ seq: 0, mark: "▶", text: "l0" });
    expect(terminalLines([{ seq: 1, kind: "permission", text: "Bash [denied]" }])[0]?.mark).toBe("✕");
  });
});
