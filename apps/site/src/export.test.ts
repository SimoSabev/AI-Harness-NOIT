import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SITE_RELEASE_REPO } from "@mandat/contract";

// E9g B (D-377): the static export (apps/site/out, made by `pnpm build`, which `pnpm check` runs before the tests):
// every page exists in both languages, every link inside the site resolves, and the pages load nothing from another
// host (PRD-15: no analytics, no cookies, no external fonts). Links TO GitHub (source, release files) are plain anchors.
const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(site, "out");
const PAGES = { "index.html": "en", "download/index.html": "en", "bg/index.html": "bg", "bg/download/index.html": "bg", "404.html": "en" } as const;
const GITHUB = `https://github.com/${SITE_RELEASE_REPO}`;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = () => walk(out).map((f) => path.relative(out, f).split(path.sep).join("/"));
const read = (rel: string) => readFileSync(path.join(out, rel), "utf8");
const attrs = (html: string, name: string) => [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, "g"))].map((m) => m[1] ?? "");
const ids = (html: string) => new Set(attrs(html, "id"));

/** The file a site path is served from (trailingSlash export: /download/ → download/index.html). */
function target(p: string): string {
  const clean = decodeURI(p.split(/[?#]/)[0] ?? "").replace(/^\//, "");
  return clean === "" || clean.endsWith("/") ? `${clean}index.html` : clean;
}

describe("site export (E9g B)", () => {
  it("was built (pnpm build) with every page in both languages", () => {
    expect(existsSync(out), "apps/site/out is missing: run `pnpm build` first").toBe(true);
    for (const [page, lang] of Object.entries(PAGES)) {
      expect(existsSync(path.join(out, page)), page).toBe(true);
      expect(read(page), page).toMatch(new RegExp(`<html lang="${lang}"`));
    }
    expect(existsSync(path.join(out, "fonts/tektur-latin.woff2"))).toBe(true);
  });

  it("every internal link and asset resolves, including #anchors", () => {
    const broken: string[] = [];
    for (const page of files().filter((f) => f.endsWith(".html"))) {
      const html = read(page);
      for (const ref of [...attrs(html, "href"), ...attrs(html, "src")]) {
        if (ref.startsWith("#")) {
          if (ref.length > 1 && !ids(html).has(ref.slice(1))) broken.push(`${page}: ${ref}`);
          continue;
        }
        if (!ref.startsWith("/") || ref.startsWith("//")) continue;
        const file = target(ref);
        if (!existsSync(path.join(out, file))) {
          broken.push(`${page}: ${ref}`);
          continue;
        }
        const hash = ref.split("#")[1];
        if (hash && file.endsWith(".html") && !ids(read(file)).has(hash)) broken.push(`${page}: ${ref}`);
      }
    }
    for (const css of files().filter((f) => f.endsWith(".css"))) {
      for (const m of read(css).matchAll(/url\(\s*["']?(\/[^"')]+)["']?\s*\)/g)) {
        const ref = m[1] ?? "";
        if (!ref.startsWith("//") && !existsSync(path.join(out, target(ref)))) broken.push(`${css}: ${ref}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("the home page links the download page with an anchor per system, and each language links the other", () => {
    expect(attrs(read("index.html"), "href")).toEqual(expect.arrayContaining(["/download/", "/bg/"]));
    expect(attrs(read("bg/download/index.html"), "href")).toEqual(expect.arrayContaining(["/bg/", "/download/"]));
    for (const id of ["mac", "windows", "linux", "phone"]) expect(ids(read("download/index.html")).has(id), id).toBe(true);
  });

  it("no request to another host: no external script, style, font, image or frame; links only to the repo", () => {
    const external = /^(https?:)?\/\//i;
    const found: string[] = [];
    for (const page of files().filter((f) => f.endsWith(".html"))) {
      const html = read(page);
      for (const tag of html.match(/<(script|link|img|iframe|source|video|audio|embed|object)\b[^>]*>/gi) ?? []) {
        for (const ref of [...attrs(tag, "src"), ...attrs(tag, "href"), ...attrs(tag, "srcset"), ...attrs(tag, "data")]) {
          if (external.test(ref)) found.push(`${page}: ${tag.slice(0, 80)}`);
        }
      }
      for (const a of html.match(/<a\b[^>]*>/gi) ?? []) {
        for (const ref of attrs(a, "href")) if (external.test(ref) && !ref.startsWith(GITHUB)) found.push(`${page}: ${ref}`);
      }
    }
    for (const css of files().filter((f) => f.endsWith(".css"))) {
      for (const m of read(css).matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/g)) {
        const ref = m[1] ?? m[2] ?? "";
        if (external.test(ref)) found.push(`${css}: ${ref}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("no cookies, storage or beacons anywhere in the export", () => {
    const hits = files()
      .filter((f) => /\.(html|js)$/.test(f))
      .filter((f) => /document\.cookie|localStorage|sessionStorage|sendBeacon|googletagmanager|google-analytics/.test(read(f)));
    expect(hits).toEqual([]);
  });
});
