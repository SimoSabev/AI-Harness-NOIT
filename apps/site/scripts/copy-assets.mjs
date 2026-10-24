#!/usr/bin/env node
// E9g B (D-377): the site uses the web's self-hosted fonts and icon (same design, no Google/CDN request). They are
// copied at build time, so the repo keeps one copy (apps/web/public); apps/site/public/{fonts,icon-192.png} are ignored by git.
import { copyFileSync, cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.resolve(site, "../web/public");
const pub = path.join(site, "public");

mkdirSync(pub, { recursive: true });
rmSync(path.join(pub, "fonts"), { recursive: true, force: true });
cpSync(path.join(web, "fonts"), path.join(pub, "fonts"), { recursive: true });
copyFileSync(path.join(web, "icon-192.png"), path.join(pub, "icon-192.png"));
console.log("site: fonts and icon copied from apps/web/public");
