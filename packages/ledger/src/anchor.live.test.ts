import { describe, expect, it } from "vitest";
import { requestAnchor } from "./anchor.js";

// D-228: live tests are SKIPPED without their env and never count as passed. Simo runs: MANDAT_LIVE_TSA=1 TSA_URLS=… pnpm test:live
const live = process.env.MANDAT_LIVE_TSA === "1" && Boolean(process.env.TSA_URLS);
describe("RFC 3161 live", () => {
  // D-276: needs MANDAT_LIVE_TSA=1 and TSA_URLS (docs/setup/tsa.md)
  it.skipIf(!live)("истински TSA подписва последния hash", async () => {
    const r = await requestAnchor({ lastHash: `sha256:${"ef".repeat(32)}`, urls: (process.env.TSA_URLS ?? "").split(",") });
    expect(r.ok).toBe(true);
  });
});
