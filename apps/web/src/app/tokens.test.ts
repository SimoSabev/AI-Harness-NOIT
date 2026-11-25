import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// AC-12.4 + E9g B (D-377): the design tokens are ONE file (apps/web/src/app/tokens.css). The web and the download site
// (apps/site) both import it, so the site has the same colours and fonts as the app and nobody keeps a second copy.
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../../..");
const SKIP = new Set(["node_modules", ".next", "out", "dist", "coverage", ".turbo", "test-results", "public"]);

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (SKIP.has(n)) return [];
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? cssFiles(p) : n.endsWith(".css") ? [p] : [];
  });
}

describe("one token file (AC-12.4, E9g B)", () => {
  it("only apps/web/src/app/tokens.css defines the theme colours", () => {
    const defining = cssFiles(path.join(repo, "apps"))
      .filter((f) => /--canvas:\s*#/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(repo, f).split(path.sep).join("/"));
    expect(defining).toEqual(["apps/web/src/app/tokens.css"]);
  });
  it("the web and the download site import it", () => {
    expect(readFileSync(path.join(here, "globals.css"), "utf8")).toMatch(/@import\s+"\.\/tokens\.css"/);
    const site = readFileSync(path.join(repo, "apps/site/src/app/site.css"), "utf8");
    expect(site).toMatch(/@import\s+"(\.\.\/)+web\/src\/app\/tokens\.css"/);
  });
  it("the fonts are the system's own (D-602): SF Pro / Segoe UI for text, the system mono for code; nothing to load", () => {
    const css = readFileSync(path.join(here, "tokens.css"), "utf8");
    expect(css).not.toMatch(/@font-face/);
    expect(css).not.toMatch(/url\(\s*["']?(https?:)?\/\//);
    expect(css).toMatch(/--font-sans:\s*ui-sans-serif,\s*-apple-system,\s*BlinkMacSystemFont,\s*"Segoe UI"/);
    expect(css).toMatch(/--font-display:\s*ui-sans-serif/);
    expect(css).toMatch(/--font-mono:\s*ui-monospace,\s*"SF Mono"/);
    // D-608: under lang="bg" SF Pro switches to its Bulgarian letterforms; the common ones read better on screen
    expect(css).toMatch(/html\s*\{[^}]*font-feature-settings:\s*"locl" 0/);
  });
  it("the logo is one class of the token file: the straps in ink, the star in the accent the person picked (D-599)", () => {
    const css = readFileSync(path.join(here, "tokens.css"), "utf8");
    const mark = /\.logo-mark::before\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    const star = /\.logo-mark::after\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(mark).toMatch(/background:\s*var\(--ink\)/);
    expect(mark).toMatch(/mask:[^;]*url\("data:image\/svg\+xml/);
    expect(star).toMatch(/background:\s*var\(--accent\)/);
    expect(star).toMatch(/mask:[^;]*url\("data:image\/svg\+xml/);
  });
  it("the brand colours: Harnova green is the default accent, amber waits on a person, cyan is proven (D-599)", () => {
    const css = readFileSync(path.join(here, "tokens.css"), "utf8");
    const dark = /:root,\s*:root\[data-theme="dark"\]\s*\{[^}]*\}/.exec(css)?.[0] ?? "";
    expect(dark).toMatch(/--accent:\s*#a6c25e/);
    expect(dark).toMatch(/--canvas:\s*#10161a/);
    expect(dark).toMatch(/--warn:\s*#f2c14e/);
    expect(dark).toMatch(/--ok:\s*#4cc3e0/);
    expect(dark).toMatch(/--info:\s*#7c95ff/);
    expect(dark).toMatch(/--bad:\s*#ff7a66/);
  });
});
