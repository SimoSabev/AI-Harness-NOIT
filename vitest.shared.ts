import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

// Tests import workspace packages from source, so `pnpm test` does not depend on stale dist/.
export function workspaceAliases(): { find: RegExp; replacement: string }[] {
  const out: { find: RegExp; replacement: string }[] = [];
  for (const dir of ["packages", "apps"]) {
    const abs = path.join(root, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      const entry = path.join(abs, name, "src", "index.ts");
      if (existsSync(entry)) out.push({ find: new RegExp(`^@mandat/${name}$`), replacement: entry });
      // subpath exports (@mandat/mcp-bridge/registry) → src/<sub>.ts, only where that source file exists
      const pkg = path.join(abs, name, "package.json");
      const exp = existsSync(pkg) ? ((JSON.parse(readFileSync(pkg, "utf8")) as { exports?: Record<string, unknown> }).exports ?? {}) : {};
      for (const sub of Object.keys(exp).filter((k) => /^\.\/[a-z-]+$/.test(k))) {
        const src = path.join(abs, name, "src", `${sub.slice(2)}.ts`);
        if (existsSync(src)) out.push({ find: new RegExp(`^@mandat/${name}/${sub.slice(2)}$`), replacement: src });
      }
    }
  }
  return out;
}

export const EXCLUDE = ["**/node_modules/**", "**/dist/**", "fixtures/**", ".mandat/**", ".claude/**"];
