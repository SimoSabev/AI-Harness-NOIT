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
  it("the fonts are self-hosted: no external url in the token file", () => {
    const css = readFileSync(path.join(here, "tokens.css"), "utf8");
    expect(css).toMatch(/url\("\/fonts\/tektur-latin\.woff2"\)/);
    expect(css).not.toMatch(/url\(\s*["']?(https?:)?\/\//);
  });
});
