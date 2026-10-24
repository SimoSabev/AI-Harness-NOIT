import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CROPS, GEOMETRY, ICONS, MARK, SOURCE, markSvg } from "./brand-icons.mjs";

// D-382, D-383: the logo is the image Simo chose (ChatGPT Images, texture and relief as they are); the script cuts the
// icons from it. Only the macOS menu bar gets the box as a one-colour shape (a template image is black + alpha).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pub = (f: string) => path.join(repo, "apps/web/public", f);

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

describe("the logo (D-382, D-383)", () => {
  it("the source is the chosen image, 1254 × 1254 WebP, kept as it is", () => {
    const b = readFileSync(SOURCE);
    expect(b.subarray(0, 4).toString("latin1") + b.subarray(8, 16).toString("latin1")).toBe("RIFFWEBPVP8X");
    expect([b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1]).toEqual([1254, 1254]);
  });

  it("every crop stays inside the image (no empty edge around the box)", () => {
    for (const [name, share] of Object.entries(CROPS)) {
      const half = MARK.h / share / 2;
      expect([MARK.cx - half, MARK.cy - half].every((v) => v >= 0), name).toBe(true);
      expect([MARK.cx + half, MARK.cy + half].every((v) => v <= 1254), name).toBe(true);
    }
  });

  it("the menu-bar template is the same box in one colour; only the check leaves it", () => {
    expect(markSvg("#000")).not.toMatch(/fill="(?!#000")/);
    const { hexagon, faces, check } = GEOMETRY;
    for (const face of faces) for (const p of face) expect(inside(p, hexagon), String(p)).toBe(true);
    expect(check.some((p) => !inside(p, hexagon))).toBe(true);
  });

  it("every PNG has its size", () => {
    expect(ICONS.map((i) => i.file)).toEqual(["logo.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "trayTemplate.png", "trayTemplate@2x.png"]);
    for (const i of ICONS) expect(pngSize(pub(i.file)), i.file).toEqual([i.size, i.size]);
  });
});
