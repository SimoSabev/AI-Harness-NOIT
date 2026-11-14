import { describe, expect, it } from "vitest";
import { runRedteam } from "./index.js";
import type { RedteamCtx, SubResult } from "./common.js";

// D-517: R16 threw (spawnSync npm ENOENT on Windows) and the throw ended the whole run, so `redteam --json` printed nothing.
// A scenario that throws is one failed row and an environment error; the other scenarios still run and the report still prints.
describe("runRedteam: a scenario that throws (D-517)", () => {
  const ctx = { home: "/h", contractPath: "/c", env: {} } as unknown as RedteamCtx;
  it("becomes a failed row and an infra error; later scenarios still run", async () => {
    const ok = async (): Promise<SubResult[]> => [{ id: "R2", sub: "a", ok: true, detail: "fine" }];
    const boom = async (): Promise<SubResult[]> => {
      throw new Error("spawnSync npm ENOENT");
    };
    const r = await runRedteam(ctx, undefined, undefined, { R1: boom, R2: ok });
    expect([r.pass, r.total]).toEqual([1, 2]);
    expect(r.rows[0]).toMatchObject({ id: "R1", ok: false });
    expect(r.rows[0]?.detail).toContain("spawnSync npm ENOENT");
    expect(r.infraError).toContain("R1");
  });
});
