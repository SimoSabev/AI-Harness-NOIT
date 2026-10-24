#!/usr/bin/env node
// D-382, D-383: the logo is the image Simo chose (ChatGPT Images, 24.10.2026: the isometric box with the check and the
// circuit, texture and relief as they are), scripts/brand/logo-source.webp. This script cuts the icons from it; only the
// macOS menu bar gets the box as a one-colour shape, drawn here (a template image is black + alpha, D-382).
//
//   node scripts/brand-icons.mjs     # writes apps/web/public/{logo,icon-192,icon-512,icon-maskable-512,trayTemplate}.png
//
// The PNGs are rendered by Chromium (the Playwright of apps/web, as in scripts/site-shots.mjs; MANDAT_CHROMIUM
// overrides the browser). The site copies what it needs from apps/web/public (apps/site/scripts/copy-assets.mjs).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// The menu-bar shape, measured on the image (1254 px) and cleaned to the 30°/45° grid; the mark is the 620 × 620
// square around it.
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

const n = (/** @type {number} */ v) => String(Math.round(v * 10) / 10);
const pts = (/** @type {Pt[]} */ list) => list.map(([x, y]) => `${n(x - VIEW[0])},${n(y - VIEW[1])}`).join(" ");
const viewed = (/** @type {Pt[]} */ list) => list.map(([x, y]) => /** @type {Pt} */ ([x - VIEW[0], y - VIEW[1]]));

/** The drawing in mark units (0..620), for the tests. */
export const GEOMETRY = { hexagon: viewed(Object.values(O)), faces: [top, left, right].map(viewed), check: viewed(check) };

/** the polygons, all in one colour */
const shapes = (/** @type {string} */ fill) => [top, left, right, check].map((p) => `<polygon fill="${fill}" points="${pts(p)}"/>`).join("");

/** The one-colour box: the macOS menu-bar template. */
export function markSvg(/** @type {string} */ fill) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW[2]} ${VIEW[2]}">${shapes(fill)}</svg>\n`;
}

// The image: 1254 × 1254; the box with the check spans x 356–922, y 294–908 (centre 639, 601; 614 high).
export const SOURCE = path.join(repo, "scripts/brand/logo-source.webp");
export const MARK = { cx: 639, cy: 601, h: 614 };
/** how much of the square the box fills: the header and tab logo, the app tile, the PWA maskable (safe circle 40 %) */
export const CROPS = { logo: 0.86, app: 0.64, maskable: 0.56 };

/** the image scaled so the box is `share` of `side`, centred in a `side` px square */
function crop(/** @type {string} */ src, /** @type {number} */ side, /** @type {number} */ share) {
  const k = (side * share) / MARK.h;
  return `<img src="${src}" style="position:absolute;width:${1254 * k}px;left:${side / 2 - MARK.cx * k}px;top:${side / 2 - MARK.cy * k}px">`;
}
/** header and browser tab: the box close up, rounded corners */
const logo = (/** @type {number} */ s, /** @type {string} */ src) => `<div style="position:relative;width:${s}px;height:${s}px;border-radius:${s * 0.22}px;overflow:hidden">${crop(src, s, CROPS.logo)}</div>`;
/** Dock, taskbar, PWA "any": a rounded tile on the Apple icon grid (824 of 1024, radius 185), a thin edge for dark docks */
function appIcon(/** @type {number} */ s, /** @type {string} */ src) {
  const inset = (s * 100) / 1024;
  const tile = (s * 824) / 1024;
  return `<div style="position:absolute;left:${inset}px;top:${inset}px;width:${tile}px;height:${tile}px;border-radius:${(tile * 185) / 824}px;overflow:hidden">${crop(src, tile, CROPS.app)}` +
    `<div style="position:absolute;inset:0;border-radius:inherit;box-shadow:inset 0 0 0 ${s / 256}px #232a25"></div></div>`;
}
/** PWA "maskable": full bleed */
const maskable = (/** @type {number} */ s, /** @type {string} */ src) => `<div style="position:relative;width:${s}px;height:${s}px;overflow:hidden">${crop(src, s, CROPS.maskable)}</div>`;
/** macOS menu bar: black + alpha, the file name ends in "Template" (Electron, D-382); the box is 16 of 18 points */
function template(/** @type {number} */ s) {
  const mark = (s * 16) / 18;
  const o = (s - mark) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><svg x="${o}" y="${o}" width="${mark}" height="${mark}" viewBox="0 0 ${VIEW[2]} ${VIEW[2]}">${shapes("#000")}</svg></svg>`;
}

export const ICONS = [
  { file: "logo.png", size: 256, draw: logo },
  { file: "icon-192.png", size: 192, draw: appIcon },
  { file: "icon-512.png", size: 512, draw: appIcon },
  { file: "icon-maskable-512.png", size: 512, draw: maskable },
  { file: "trayTemplate.png", size: 18, draw: template },
  { file: "trayTemplate@2x.png", size: 36, draw: template },
];

async function main() {
  const pub = path.join(repo, "apps/web/public");
  const src = `data:image/webp;base64,${readFileSync(SOURCE).toString("base64")}`;
  const webRequire = createRequire(path.join(repo, "apps/web/package.json"));
  const { chromium } = webRequire("@playwright/test");
  const browser = await chromium.launch(process.env.MANDAT_CHROMIUM ? { executablePath: process.env.MANDAT_CHROMIUM } : {});
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const icon of ICONS) {
      await page.setViewportSize({ width: icon.size, height: icon.size });
      await page.setContent(`<!doctype html><body style="margin:0">${icon.draw(icon.size, src)}</body>`);
      await page.screenshot({ path: path.join(pub, icon.file), omitBackground: true, clip: { x: 0, y: 0, width: icon.size, height: icon.size } });
      console.log(`brand-icons: ${icon.file}`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
