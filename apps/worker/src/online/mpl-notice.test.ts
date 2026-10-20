import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Демо промпт т. 4.3: MPL-2.0 (web-push) with the GPL harness — allowed unless a file says
// „Incompatible With Secondary Licenses“; the web-push files stay under MPL-2.0.
const root = path.dirname(createRequire(import.meta.url).resolve("web-push/package.json"));
function files(d: string): string[] {
  return readdirSync(d).flatMap((n) => {
    const p = path.join(d, n);
    if (n === "node_modules") return [];
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("mpl-notice", () => {
  it("web-push 3.6.7: MPL-2.0, без „Incompatible With Secondary Licenses“", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { version: string; license: string };
    expect([pkg.version, pkg.license]).toEqual(["3.6.7", "MPL-2.0"]);
    const hits = files(root).filter((f) => /Incompatible With Secondary Licenses/i.test(readFileSync(f, "latin1")));
    expect(hits).toEqual([]);
  });
});
