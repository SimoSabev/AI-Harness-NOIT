#!/usr/bin/env node
// E9g B (D-377): the site uses the web's self-hosted fonts, icon and logo (same design, no Google/CDN request, D-382).
// They are copied at build time, so the repo keeps one copy (apps/web/public); the copies in apps/site/public are ignored by git.
import { copyFileSync, cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.resolve(site, "../web/public");
const pub = path.join(site, "public");

mkdirSync(pub, { recursive: true });
rmSync(path.join(pub, "fonts"), { recursive: true, force: true });
cpSync(path.join(web, "fonts"), path.join(pub, "fonts"), { recursive: true });
for (const f of ["icon-192.png", "logo-mark.svg", "favicon.svg"]) copyFileSync(path.join(web, f), path.join(pub, f));
console.log("site: fonts, icon and logo copied from apps/web/public");
