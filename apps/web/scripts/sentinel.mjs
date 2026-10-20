#!/usr/bin/env node
// Демо промпт т. 8 „Общо за E3“ (S23): build with sentinel VALUES of the server keys, then search the build output for
// those values (not the names). Static assets and prerendered HTML must have 0 hits; the server chunks too.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rand = () => randomBytes(8).toString("hex");
const sentinels = {
  SUPABASE_SERVICE_ROLE_KEY: `SENTINEL_SRK_${rand()}`,
  VAPID_PRIVATE_KEY: `SENTINEL_VAPID_${rand()}`,
  GITHUB_WRITER_PRIVATE_KEY: `SENTINEL_GH_${rand()}`,
  GITHUB_OBSERVER_PRIVATE_KEY: `SENTINEL_GH_${rand()}`,
  GITHUB_WRITER_WEBHOOK_SECRET: `SENTINEL_GH_${rand()}`,
};

export function scan(dir, values) {
  const hits = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name);
      if (name === "cache") continue;
      if (statSync(p).isDirectory()) walk(p);
      else {
        const text = readFileSync(p).toString("latin1");
        for (const v of values) if (text.includes(v)) hits.push(`${path.relative(web, p)}: ${v.slice(0, 13)}…`);
      }
    }
  };
  walk(dir);
  return hits;
}

if (process.argv[1] !== fileURLToPath(import.meta.url)) {
  // imported by the test: only scan()
} else main();

function main() {
execFileSync("node", [path.join(web, "node_modules/next/dist/bin/next"), "build"], { cwd: web, stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, ...sentinels, NEXT_TELEMETRY_DISABLED: "1" } });
const hits = scan(path.join(web, ".next"), Object.values(sentinels));
if (hits.length > 0) {
  console.error(`sentinel: ${hits.length} hit(s)\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`sentinel ok: 0 hits for ${Object.keys(sentinels).length} server keys in .next (static, server, html)`);
}
