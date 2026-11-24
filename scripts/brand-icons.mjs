#!/usr/bin/env node
// D-599: the Harnova mark of the brand kit (Claude Design, 24.11.2026): two straps (the harness) holding a four-point
// star (Nova). Straps in ink, the star in Harnova green; on the app tile the ground is the brand's night. This script
// draws the icons from it; the macOS menu bar gets the mark as a one-colour shape (a template image is black + alpha,
// D-382). In the web the logo is CSS (.logo-mark in tokens.css), so it follows the accent the person picks.
//
//   node scripts/brand-icons.mjs     # writes apps/web/public/{logo,icon-192,icon-512,icon-maskable-512,trayTemplate}.png
//
// The PNGs are rendered by Chromium (the Playwright of apps/web, as in scripts/site-shots.mjs; MANDAT_CHROMIUM
// overrides the browser). The site copies what it needs from apps/web/public (apps/site/scripts/copy-assets.mjs).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** the mark in a 64-unit square */
export const MARK = {
  straps: [{ x: 6, y: 8, w: 10, h: 48, r: 5 }, { x: 48, y: 8, w: 10, h: 48, r: 5 }],
  star: "M32 13C33.3 26 37 30.7 45 32C37 33.3 33.3 38 32 51C30.7 38 27 33.3 19 32C27 30.7 30.7 26 32 13Z",
};
const NIGHT = "#10161a";
const LINE = "#283640";
const INK = "#eaf0f2";
const GREEN = "#a6c25e";

/** the mark as SVG */
export function markSvg(/** @type {{ ink: string, star: string }} */ c, size = 64) {
  const straps = MARK.straps.map((s) => `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}" fill="${c.ink}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${straps}<path d="${MARK.star}" fill="${c.star}"/></svg>`;
}

/** header and browser tab: the mark on a night tile, rounded */
const logo = (/** @type {number} */ s) => `<div style="width:${s}px;height:${s}px;border-radius:${s * 0.22}px;background:${NIGHT};display:flex;align-items:center;justify-content:center">${markSvg({ ink: INK, star: GREEN }, s * 0.78)}</div>`;
/** Dock, taskbar, PWA "any": a rounded tile on the Apple icon grid (824 of 1024, radius 185), a thin edge for dark docks */
function appIcon(/** @type {number} */ s) {
  const inset = (s * 100) / 1024;
  const tile = (s * 824) / 1024;
  return `<div style="position:absolute;left:${inset}px;top:${inset}px;width:${tile}px;height:${tile}px;border-radius:${(tile * 185) / 824}px;background:${NIGHT};box-shadow:inset 0 0 0 ${s / 256}px ${LINE};display:flex;align-items:center;justify-content:center">${markSvg({ ink: INK, star: GREEN }, tile * 0.66)}</div>`;
}
/** PWA "maskable": full bleed, the mark inside the safe circle (40 %) */
const maskable = (/** @type {number} */ s) => `<div style="width:${s}px;height:${s}px;background:${NIGHT};display:flex;align-items:center;justify-content:center">${markSvg({ ink: INK, star: GREEN }, s * 0.58)}</div>`;
/** macOS menu bar: black + alpha, the file name ends in "Template" (Electron, D-382); the mark is 16 of 18 points */
const template = (/** @type {number} */ s) => `<div style="width:${s}px;height:${s}px;display:flex;align-items:center;justify-content:center">${markSvg({ ink: "#000", star: "#000" }, (s * 16) / 18)}</div>`;

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
  const webRequire = createRequire(path.join(repo, "apps/web/package.json"));
  const { chromium } = webRequire("@playwright/test");
  const browser = await chromium.launch(process.env.MANDAT_CHROMIUM ? { executablePath: process.env.MANDAT_CHROMIUM } : {});
  try {
    for (const icon of ICONS) {
      // a page per icon: some Chromium builds keep the first viewport after a resize
      const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: icon.size, height: icon.size } });
      await page.setContent(`<!doctype html><body style="margin:0;position:relative">${icon.draw(icon.size)}</body>`);
      await page.screenshot({ path: path.join(pub, icon.file), omitBackground: true, clip: { x: 0, y: 0, width: icon.size, height: icon.size } });
      await page.close();
      console.log(`brand-icons: ${icon.file}`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
