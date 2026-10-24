import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GEOMETRY, ICONS, faviconSvg, markSvg } from "./brand-icons.mjs";

// D-382: the logo (an isometric box cut at its three inner edges; the check leaves it through the top face) is drawn
// once, in scripts/brand-icons.mjs; the SVGs and PNGs in apps/web/public are its output.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = (f: string) => path.join(repo, "apps/web/public", f);
const tokens = readFileSync(path.join(repo, "apps/web/src/app/tokens.css"), "utf8");
const accent = (theme: "dark" | "light") => new RegExp(`\\[data-theme="${theme}"\\]\\s*\\{[^}]*--accent:\\s*(#[0-9a-f]{6})`).exec(tokens)?.[1];

/** width and height from the IHDR chunk */
function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString("latin1")).toBe("PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

type Pt = [number, number];
/** inside a convex polygon (any winding), with a tolerance in drawing units */
function inside(p: Pt, poly: Pt[], tol = 0.5): boolean {
  const side = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length] as Pt;
    return ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
  return side.every((s) => s >= -tol) || side.every((s) => s <= tol);
}

describe("the logo (D-382)", () => {
  it("the committed SVGs are what the script draws", () => {
    expect(readFileSync(pub("logo-mark.svg"), "utf8")).toBe(markSvg("#000"));
    expect(readFileSync(pub("favicon.svg"), "utf8")).toBe(faviconSvg());
  });

  it("the mark is one colour (it is a CSS mask and the macOS template image); the favicon takes the theme's accent", () => {
    expect([...markSvg("#000").matchAll(/fill="([^"]+)"/g)].map((m) => m[1])).toEqual(expect.arrayContaining(["#000"]));
    expect(markSvg("#000")).not.toMatch(/fill="(?!#000")/);
    expect(accent("dark")).toBe("#a6c25e");
    expect(faviconSvg()).toContain(`fill:${accent("light")}`);
    expect(faviconSvg()).toMatch(new RegExp(`prefers-color-scheme:\\s*dark\\)\\s*\\{[^}]*fill:${accent("dark")}`));
  });

  it("the check is the only part that leaves the box", () => {
    const { hexagon, faces, check } = GEOMETRY;
    for (const face of faces) for (const p of face) expect(inside(p, hexagon), String(p)).toBe(true);
    expect(check.some((p) => !inside(p, hexagon))).toBe(true);
  });

  it("every PNG has its size", () => {
    expect(ICONS.map((i) => i.file)).toEqual(["icon-192.png", "icon-512.png", "icon-maskable-512.png", "trayTemplate.png", "trayTemplate@2x.png"]);
    for (const i of ICONS) expect(pngSize(pub(i.file)), i.file).toEqual([i.size, i.size]);
  });
});
