import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { scan } from "../scripts/sentinel.mjs";

describe("sentinel scan (S23)", () => {
  it("намира стойността в static/server, пропуска cache", () => {
    const d = mkdtempSync(path.join(os.tmpdir(), "sentinel-"));
    mkdirSync(path.join(d, "static", "chunks"), { recursive: true });
    mkdirSync(path.join(d, "cache"), { recursive: true });
    writeFileSync(path.join(d, "static", "chunks", "a.js"), "var k='SENTINEL_SRK_abc';");
    writeFileSync(path.join(d, "cache", "b.js"), "SENTINEL_GH_def");
    expect(scan(d, ["SENTINEL_SRK_abc", "SENTINEL_GH_def"])).toHaveLength(1);
    expect(scan(d, ["SENTINEL_VAPID_x"])).toEqual([]);
  });
});
