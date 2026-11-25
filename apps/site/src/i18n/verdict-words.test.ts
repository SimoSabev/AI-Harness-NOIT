import { describe, expect, it } from "vitest";
import { bg } from "./bg";
import { docsBg } from "./docs-bg";

// D-606: the Bulgarian verdict words are the screen's: ПРОВЕРЕНО / НЕЯСНО / ПРОВАЛ (apps/web verdict.*), on every page.
describe("site verdict words in Bulgarian (D-606)", () => {
  it("UNKNOWN is НЕЯСНО", () => {
    expect(docsBg["verdict.UNKNOWN"]).toBe("НЕЯСНО");
  });
  it("no page uses an older word for UNKNOWN", () => {
    for (const [k, v] of [...Object.entries(bg), ...Object.entries(docsBg)]) expect(v, k).not.toMatch(/НЕИЗВЕСТНО|НЕПРОВЕРЕНО/);
  });
});
