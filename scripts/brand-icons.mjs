#!/usr/bin/env node
// D-382: the logo, drawn once. An isometric box (a pointy-top hexagon) cut at its three inner edges (upper-left,
// upper-right, bottom); the check stands in it and leaves through the top face: the agent's work gets out only
// verified. Measured on the image Simo chose (ChatGPT, 24.10.2026) and cleaned to the 30°/45° grid.
//
//   node scripts/brand-icons.mjs     # writes apps/web/public/{logo-mark,favicon}.svg and the PNG icons
//
// The PNGs are rendered by Chromium (the Playwright of apps/web, as in scripts/site-shots.mjs; MANDAT_CHROMIUM
// overrides the browser). The site copies what it needs from apps/web/public (apps/site/scripts/copy-assets.mjs).
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Drawing space: the 1254 px original; the mark is the 620 × 620 square around it.
const VIEW = [330.75, 291, 620];
const COS30 = Math.sqrt(3) / 2;
const C = /** @type {Pt} */ ([627, 601]);
const R = 310; // outer radius of the hexagon
const RI = R - 62 / COS30; // the faces are 62 thick
const GAP = 14; // between the faces
const CHECK = 56; // stroke of the check
const CLEAR = 22; // around the check

/** @typedef {[number, number]} Pt */
/** @typedef {{ p: Pt, d: Pt }} Line */
const at = (/** @type {number} */ r, /** @type {number} */ deg) => /** @type {Pt} */ ([C[0] + r * Math.cos((deg * Math.PI) / 180), C[1] - r * Math.sin((deg * Math.PI) / 180)]);
const corners = (/** @type {number} */ r) => ({ T: at(r, 90), UR: at(r, 30), LR: at(r, -30), B: at(r, -90), LL: at(r, -150), UL: at(r, 150) });
const O = corners(R);
const I = corners(RI);
const line = (/** @type {Pt} */ a, /** @type {Pt} */ b) => /** @type {Line} */ ({ p: a, d: [b[0] - a[0], b[1] - a[1]] });
/** the line moved sideways: positive = to the right of its direction, on screen (y down) */
function shift(/** @type {Line} */ l, /** @type {number} */ by) {
  const n = Math.hypot(l.d[0], l.d[1]);
  return { p: /** @type {Pt} */ ([l.p[0] - (l.d[1] / n) * by, l.p[1] + (l.d[0] / n) * by]), d: l.d };
}
function cross(/** @type {Line} */ a, /** @type {Line} */ b) {
  const den = a.d[0] * b.d[1] - a.d[1] * b.d[0];
  const t = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / den;
  return /** @type {Pt} */ ([a.p[0] + t * a.d[0], a.p[1] + t * a.d[1]]);
}

// The check: vertex of the centre line at V, arms at 45°; edges as x − y = c (short arm) and x + y = k (long arm).
const V = /** @type {Pt} */ ([627, 630]);
const half = (CHECK / 2) * Math.SQRT2;
const short = { up: V[0] - V[1] + half, low: V[0] - V[1] - half };
const long = { left: V[0] + V[1] - half, right: V[0] + V[1] + half };
const shortEnd = 1058.5; // x + y of the short arm's cut end
const tip = { top: 343, right: 923 }; // the long arm ends in a square corner, outside the box
const meet = (/** @type {number} */ c, /** @type {number} */ k) => /** @type {Pt} */ ([(k + c) / 2, (k - c) / 2]);
const check = [
  meet(short.up, shortEnd),
  meet(short.up, long.left),
  /** @type {Pt} */ ([long.left - tip.top, tip.top]),
  /** @type {Pt} */ ([tip.right, tip.top]),
  /** @type {Pt} */ ([tip.right, long.right - tip.right]),
  meet(short.low, long.right),
  meet(short.low, shortEnd),
];

// The faces: the ring between the two hexagons, cut along the box's inner edges (centre → UL, UR, B).
const toUL = line(C, O.UL);
const toUR = line(C, O.UR);
const toB = line(C, O.B);
const beside = { p: /** @type {Pt} */ ([long.left - CLEAR * Math.SQRT2, 0]), d: /** @type {Pt} */ ([1, -1]) };
const top = [
  cross(shift(toUL, GAP / 2), line(O.UL, O.T)),
  O.T,
  cross(beside, line(O.T, O.UR)),
  cross(beside, line(I.T, I.UR)),
  I.T,
  cross(shift(toUL, GAP / 2), line(I.UL, I.T)),
];
const left = [
  cross(shift(toUL, -GAP / 2), line(O.UL, O.LL)),
  O.LL,
  cross(shift(toB, GAP / 2), line(O.LL, O.B)),
  cross(shift(toB, GAP / 2), line(I.LL, I.B)),
  I.LL,
  cross(shift(toUL, -GAP / 2), line(I.UL, I.LL)),
];
// the cut at UR is moved down so the right face keeps clear of the check
const right = [
  cross(shift(toB, -GAP / 2), line(O.B, O.LR)),
  O.LR,
  cross(shift(toUR, 16), line(O.UR, O.LR)),
  cross(shift(toUR, 16), line(I.UR, I.LR)),
  I.LR,
  cross(shift(toB, -GAP / 2), line(I.B, I.LR)),
];

// The circuit inside (the full icon only): 45° runs into the wall, ring pads; the right side mirrors the left.
const mirror = (/** @type {Pt} */ [x, y]) => /** @type {Pt} */ ([2 * C[0] - x, y]);
/** @type {{ run: Pt[], pad?: Pt }[]} */
const halfCircuit = [
  { run: [[479.8, 604.8], [553, 678], [553, 778]], pad: [472, 597] },
  { run: [[412, 591.5], [529, 708.5], [529, 762]] },
  { run: [[412, 638], [486.2, 712.2]], pad: [494, 720] },
];
const circuit = halfCircuit.flatMap((c) => [c, { run: c.run.map(mirror), ...(c.pad ? { pad: mirror(c.pad) } : {}) }]);

const n = (/** @type {number} */ v) => String(Math.round(v * 10) / 10);
const pt = (/** @type {Pt} */ [x, y]) => `${n(x - VIEW[0])},${n(y - VIEW[1])}`;
const pts = (/** @type {Pt[]} */ list) => list.map(pt).join(" ");
const viewed = (/** @type {Pt[]} */ list) => list.map(([x, y]) => /** @type {Pt} */ ([x - VIEW[0], y - VIEW[1]]));

/** The drawing in mark units (0..620), for the tests. */
export const GEOMETRY = { hexagon: viewed(Object.values(O)), faces: [top, left, right].map(viewed), check: viewed(check) };

/** @typedef {{ top: string, left: string, right: string, check: string, circuit?: string }} Paint */
/** the polygons and the circuit; a colour of "" leaves the fill to CSS */
function shapes(/** @type {Paint} */ c) {
  const fill = (/** @type {string} */ f) => (f ? ` fill="${f}"` : "");
  const wires = c.circuit
    ? circuit
        .map((w) => `<polyline points="${pts(w.run)}" fill="none" stroke="${c.circuit}" stroke-width="9"/>` + (w.pad ? `<circle cx="${pt(w.pad).replace(",", '" cy="')}" r="9" fill="none" stroke="${c.circuit}" stroke-width="7"/>` : ""))
        .join("")
    : "";
  return `${wires}<polygon${fill(c.top)} points="${pts(top)}"/><polygon${fill(c.left)} points="${pts(left)}"/><polygon${fill(c.right)} points="${pts(right)}"/><polygon${fill(c.check)} points="${pts(check)}"/>`;
}
const svg = (/** @type {string} */ body, size = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW[2]} ${VIEW[2]}"${size}>${body}</svg>\n`;

/** The one-colour mark: the CSS mask of the header logo, the macOS menu-bar template. */
export function markSvg(/** @type {string} */ fill) {
  return svg(shapes({ top: fill, left: fill, right: fill, check: fill }));
}

// The tokens (apps/web/src/app/tokens.css): accent of the light and the dark theme; the tests compare them.
const ACCENT = { light: "#4f681c", dark: "#a6c25e" };
/** The browser tab: the mark in the accent of the visitor's system theme. */
export function faviconSvg() {
  return svg(`<style>polygon{fill:${ACCENT.light}}@media (prefers-color-scheme: dark){polygon{fill:${ACCENT.dark}}}</style>${shapes({ top: "", left: "", right: "", check: "" })}`);
}

// The full icon: the dark tokens, lit from above (top face = accent, left and right darker toward the canvas), the
// check in the accent text colour so it stands out.
const FULL = { top: "#a6c25e", left: "#849a4c", right: "#687a3e", check: "#b6cf7a", circuit: "#849a4c" };
const TILE = { fill: "#121613", edge: "#232a25", canvas: "#0c0f0d" };

/** The app icon (Dock, taskbar, PWA "any"): a rounded tile on the Apple icon grid (824 of 1024, radius 185). */
function appIcon(/** @type {number} */ s) {
  const inset = (s * 100) / 1024;
  const tile = (s * 824) / 1024;
  const mark = tile * 0.64;
  const o = (s - mark) / 2;
  const edge = s / 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
    `<rect x="${inset + edge / 2}" y="${inset + edge / 2}" width="${tile - edge}" height="${tile - edge}" rx="${(tile * 185) / 824}" fill="${TILE.fill}" stroke="${TILE.edge}" stroke-width="${edge}"/>` +
    `<svg x="${o}" y="${o}" width="${mark}" height="${mark}" viewBox="0 0 ${VIEW[2]} ${VIEW[2]}">${shapes(FULL)}</svg></svg>`;
}
/** PWA "maskable": full bleed; the mark stays inside the safe circle (radius 40 %). */
function maskable(/** @type {number} */ s) {
  const mark = s * 0.56;
  const o = (s - mark) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><rect width="${s}" height="${s}" fill="${TILE.canvas}"/>` +
    `<svg x="${o}" y="${o}" width="${mark}" height="${mark}" viewBox="0 0 ${VIEW[2]} ${VIEW[2]}">${shapes(FULL)}</svg></svg>`;
}
/** macOS menu bar: black + alpha, file name ends in "Template" (Electron, D-382); the mark is 16 of 18 points. */
function template(/** @type {number} */ s) {
  const mark = (s * 16) / 18;
  const o = (s - mark) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><svg x="${o}" y="${o}" width="${mark}" height="${mark}" viewBox="0 0 ${VIEW[2]} ${VIEW[2]}">${shapes({ top: "#000", left: "#000", right: "#000", check: "#000" })}</svg></svg>`;
}

export const ICONS = [
  { file: "icon-192.png", size: 192, draw: appIcon },
  { file: "icon-512.png", size: 512, draw: appIcon },
  { file: "icon-maskable-512.png", size: 512, draw: maskable },
  { file: "trayTemplate.png", size: 18, draw: template },
  { file: "trayTemplate@2x.png", size: 36, draw: template },
];

async function main() {
  const pub = path.join(repo, "apps/web/public");
  writeFileSync(path.join(pub, "logo-mark.svg"), markSvg("#000"));
  writeFileSync(path.join(pub, "favicon.svg"), faviconSvg());
  const webRequire = createRequire(path.join(repo, "apps/web/package.json"));
  const { chromium } = webRequire("@playwright/test");
  const browser = await chromium.launch(process.env.MANDAT_CHROMIUM ? { executablePath: process.env.MANDAT_CHROMIUM } : {});
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const icon of ICONS) {
      await page.setViewportSize({ width: icon.size, height: icon.size });
      await page.setContent(`<!doctype html><body style="margin:0">${icon.draw(icon.size)}</body>`);
      await page.screenshot({ path: path.join(pub, icon.file), omitBackground: true, clip: { x: 0, y: 0, width: icon.size, height: icon.size } });
      console.log(`brand-icons: ${icon.file}`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
