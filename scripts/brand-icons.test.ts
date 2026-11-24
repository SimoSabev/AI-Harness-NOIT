import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ICONS, MARK, markSvg } from "./brand-icons.mjs";

// D-599: the Harnova mark of the brand kit (Claude Design, 24.11.2026) — two straps (the harness) holding a four-point
// star (Nova). The icons are drawn from it; the macOS menu bar gets it in one colour (a template image is black + alpha).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = (f: string) => path.join(repo, "apps/web/public", f);

/** width and height from the IHDR chunk */
function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString("latin1")).toBe("PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("the logo (D-599)", () => {
  it("the mark: straps in ink, the star in Harnova green", () => {
    const svg = markSvg({ ink: "#eaf0f2", star: "#a6c25e" });
    expect(svg.match(/<rect /g)).toHaveLength(2);
    expect(svg).toContain(`d="${MARK.star}"`);
    expect(svg).toContain('fill="#a6c25e"');
  });
  it("the menu-bar template is the same mark in one colour", () => {
    expect(markSvg({ ink: "#000", star: "#000" })).not.toMatch(/fill="(?!#000")/);
  });
  it("every PNG has its size", () => {
    expect(ICONS.map((i) => i.file)).toEqual(["logo.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "trayTemplate.png", "trayTemplate@2x.png"]);
    for (const i of ICONS) expect(pngSize(pub(i.file)), i.file).toEqual([i.size, i.size]);
  });
});
