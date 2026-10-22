import { readdirSync, existsSync } from "node:fs";
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
    }
  }
  return out;
}

export const EXCLUDE = ["**/node_modules/**", "**/dist/**", "fixtures/**", ".mandat/**", ".claude/**"];
