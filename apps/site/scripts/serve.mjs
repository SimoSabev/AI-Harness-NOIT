#!/usr/bin/env node
// E9g B step 7 (D-378): serves apps/site/out on 127.0.0.1 only, the way a static host does (trailing slash →
// index.html, unknown path → 404.html). For looking at the site locally and for the axe e2e (e2e/a11y.spec.ts).
//   node apps/site/scripts/serve.mjs [port]      (default 3101)
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out");
const port = Number(process.argv[2] ?? process.env.PORT ?? 3101);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".ico": "image/x-icon" };

/** The file for a URL path inside out/, or null (no escape above out/). */
function fileFor(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const rel = clean.endsWith("/") ? `${clean}index.html` : clean;
  const file = path.resolve(out, `.${rel}`);
  if (!file.startsWith(out + path.sep)) return null;
  if (existsSync(file) && statSync(file).isFile()) return file;
  if (existsSync(`${file}.html`)) return `${file}.html`;
  if (existsSync(path.join(file, "index.html"))) return path.join(file, "index.html");
  return null;
}

if (!existsSync(out)) {
  console.error("serve: apps/site/out is missing; run `pnpm --filter @mandat/site build` first");
  process.exit(1);
}
createServer((req, res) => {
  const file = (() => {
    try {
      return fileFor(req.url ?? "/");
    } catch {
      return null; // a malformed %-escape
    }
  })();
  const status = file ? 200 : 404;
  const f = file ?? path.join(out, "404.html");
  res.writeHead(status, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream", "x-content-type-options": "nosniff" });
  createReadStream(f).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`site: http://127.0.0.1:${port}/`));
