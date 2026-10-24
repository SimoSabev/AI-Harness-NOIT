import { describe, expect, it } from "vitest";
import { en } from "../i18n/en";
import { DOCS, DOC_SLUGS, docNeighbours, docPath, docSections } from "./docs";
import { reasonText } from "./reasons";

// E9g B step 7 (D-378): the pages of /docs as data.
describe("docs pages (E9g B)", () => {
  it("the eight pages of the plan, in order, with their addresses", () => {
    expect(DOC_SLUGS).toEqual(["getting-started", "how-it-works", "verdicts", "desktop", "night-shift", "security", "keys", "faq"]);
    expect(docPath("faq")).toBe("/docs/faq/");
    expect(docNeighbours("getting-started")).toEqual({ prev: null, next: "how-it-works" });
    expect(docNeighbours("faq")).toEqual({ prev: "keys", next: null });
  });
  it("section ids are unique per page and kebab-case", () => {
    for (const s of DOC_SLUGS) {
      const ids = docSections(s).map((x) => x.id);
      expect(new Set(ids).size, s).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
  it("the verdicts page lists D1 to D12, each with an example", () => {
    const tables = DOCS.verdicts.blocks.flatMap((b) => ("table" in b ? [b.table] : []));
    const ids = tables.flatMap((t) => t.rows.map((r) => r[0])).map((c) => (typeof c === "object" && "code" in c ? c.code : ""));
    for (let i = 1; i <= 12; i++) expect(ids).toContain(`D${i}`);
    for (const t of tables) for (const r of t.rows) expect(r).toHaveLength(t.head.length);
  });
  it("every example sentence is the contract's own explain text (no 'see evidence' fallback)", () => {
    const reasons = DOCS.verdicts.blocks.flatMap((b) => ("table" in b ? b.table.rows.flat() : [])).flatMap((c) => (typeof c === "object" && "reason" in c ? [c.reason] : []));
    expect(reasons.length).toBeGreaterThanOrEqual(10);
    for (const r of reasons) {
      for (const lang of ["en", "bg"] as const) {
        const s = reasonText(r, lang);
        expect(s, r).not.toMatch(/see evidence|виж evidence|<untrusted/);
        expect(s.length, r).toBeGreaterThan(20);
      }
    }
  });
  it("code blocks are commands, not prose (no translation needed)", () => {
    for (const s of DOC_SLUGS) for (const b of DOCS[s].blocks) if ("code" in b) expect(b.code).toMatch(/^pnpm /);
    expect(en["docs.title"]).toBe("Documentation");
  });
});

describe("reason sentences (E9g B)", () => {
  it("shows the ID as «text», unescaped, like the task card", () => {
    expect(reasonText("D2:missing_test:tests/cart.spec.ts > cart > applies 10% over 50")).toBe("Test «tests/cart.spec.ts > cart > applies 10% over 50» exists on base and is missing after the change. A deleted test cannot pass.");
    expect(reasonText("D3:protected:a&b.yml", "bg")).toBe("Променен е защитен файл «a&b.yml».");
  });
});
