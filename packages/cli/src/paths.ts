import path from "node:path";
import { fileURLToPath } from "node:url";

/** <repo> = three levels up from packages/cli/{dist,src}/<file> (D-054), not the cwd. */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function mandatHome(o: { home?: string | undefined; env: Record<string, string | undefined> }): string {
  return path.resolve(o.home ?? o.env.MANDAT_HOME ?? path.join(repoRoot, ".mandat"));
}
