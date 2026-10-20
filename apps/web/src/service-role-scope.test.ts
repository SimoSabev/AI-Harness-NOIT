import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Демо промпт т. 8 „Общо за E3“ (S23): SUPABASE_SERVICE_ROLE_KEY is read only in apps/worker, packages/verify and the
// server-only apps/web/src/lib/server/admin.ts; admin.ts is imported only by Route Handlers; client modules never
// import lib/server.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SKIP = new Set(["node_modules", "dist", ".next", "coverage", "fixtures", ".mandat", "test-results"]);

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/\.test(-helper)?\.ts$/.test(name)) out.push(p);
  }
  return out;
}
const src = [...files(path.join(repo, "packages")), ...files(path.join(repo, "apps"))].map((f) => path.relative(repo, f));
const read = (f: string) => readFileSync(path.join(repo, f), "utf8");

describe("service-role-scope", () => {
  it("ключът се чете само в разрешените модули", () => {
    const readers = src.filter((f) => /(\.|\[["'])SUPABASE_SERVICE_ROLE_KEY\b/.test(read(f)));
    const allowed = (f: string) => f.startsWith("apps/worker/src/") || f.startsWith("packages/verify/src/") || f === "apps/web/src/lib/server/admin.ts";
    expect(readers.filter((f) => !allowed(f))).toEqual([]);
    expect(readers).toContain("apps/web/src/lib/server/admin.ts");
  });
  it("admin.ts е server-only и се внася само от app/api/**/route.ts", () => {
    expect(read("apps/web/src/lib/server/admin.ts").startsWith('import "server-only";')).toBe(true);
    const importers = src.filter((f) => f.startsWith("apps/web/") && /from\s+["'][^"']*lib\/server\/admin["']|from\s+["']\.\/admin["']/.test(read(f)));
    expect(importers.filter((f) => !/^apps\/web\/src\/app\/api\/.+\/route\.ts$/.test(f))).toEqual([]);
  });
  it("клиентските модули (\"use client\") не внасят lib/server", () => {
    const client = src.filter((f) => f.startsWith("apps/web/") && /^\s*["']use client["']/.test(read(f)));
    expect(client.filter((f) => /lib\/server\//.test(read(f)))).toEqual([]);
  });
});
