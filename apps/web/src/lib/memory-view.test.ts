import { describe, expect, it } from "vitest";
import type { MemoryItem } from "@mandat/contract";
import { MEMORY_FILTERS, memoryHref, parseMemoryQuery, visibleMemories } from "./memory-view";

let n = 0;
const m = (text: string, o: Partial<MemoryItem> = {}): MemoryItem => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, scope: "user", kind: "fact", text, status: "active", source: "human", basis: null, repo_id: null,
  entities: [], pinned: false, uses: 0, last_used_at: null, created_at: "2026-10-26T10:00:00.000Z", invalid_at: null, superseded_by: null, provenance: {}, ...o,
});
const items = [
  m("Отговаряй на български"),
  m("Тестовете са с vitest", { scope: "project", repo_id: "22222222-2222-4222-8222-222222222222", entities: ["vitest"] }),
  m("Количката е в src/cart.ts", { status: "pending", scope: "project", repo_id: "22222222-2222-4222-8222-222222222222" }),
  m("Ползвам npm", { status: "invalid" }),
  m("Старо", { status: "archived" }),
];

describe("изгледът на паметта", () => {
  it("заявката от адреса: изглед, филтър, търсене, избран; непознатото → по подразбиране", () => {
    expect(parseMemoryQuery({})).toEqual({ view: "list", filter: "all", q: "", id: null });
    expect(parseMemoryQuery({ view: "graph", f: "pending", q: "  vitest ", id: items[1]?.id })).toEqual({ view: "graph", filter: "pending", q: "vitest", id: items[1]?.id });
    expect(parseMemoryQuery({ view: "x", f: "nope", id: "../etc" })).toEqual({ view: "list", filter: "all", q: "", id: null });
    expect(MEMORY_FILTERS).toEqual(["all", "mine", "project", "pending", "archive"]);
  });
  it("филтри: за теб, проекти, чака, архив (заменените са там)", () => {
    const t = (f: (typeof MEMORY_FILTERS)[number]) => visibleMemories(items, { view: "list", filter: f, q: "", id: null }).map((x) => x.text);
    expect(t("all")).toEqual(["Отговаряй на български", "Тестовете са с vitest", "Количката е в src/cart.ts"]);
    expect(t("mine")).toEqual(["Отговаряй на български"]);
    expect(t("project")).toEqual(["Тестовете са с vitest", "Количката е в src/cart.ts"]);
    expect(t("pending")).toEqual(["Количката е в src/cart.ts"]);
    expect(t("archive")).toEqual(["Ползвам npm", "Старо"]);
  });
  it("търсене: подредено по съвпадение, в избрания филтър; думи в друга форма", () => {
    expect(visibleMemories(items, { view: "list", filter: "all", q: "тестът", id: null }).map((x) => x.text)).toEqual(["Тестовете са с vitest"]);
    expect(visibleMemories(items, { view: "list", filter: "archive", q: "npm", id: null }).map((x) => x.text)).toEqual(["Ползвам npm"]);
  });
  it("линкът пази изгледа, филтъра и търсенето", () => {
    expect(memoryHref({ view: "graph", filter: "pending", q: "a b", id: null }, { id: "x" })).toBe("/memory?view=graph&f=pending&q=a+b&id=x");
    expect(memoryHref({ view: "list", filter: "all", q: "", id: "x" }, { id: null })).toBe("/memory");
  });
});
