import { describe, expect, it } from "vitest";
import { anchorDatum, anchorDigest, buildTsRequest, requestAnchor, verifyTsResponse } from "./anchor.js";
import { localTsa } from "./local-tsa.test-helper.js";

const LAST = `sha256:${"ab".repeat(32)}`;

describe("RFC 3161 котва (т. 5.4; локален TSA)", () => {
  it("заявка → отговор → проверена котва", async () => {
    const tsa = await localTsa();
    const r = await requestAnchor({ lastHash: LAST, urls: ["https://tsa.invalid/tsr"], fetcher: async (_u, body) => ({ status: 200, body: await tsa.respond(body) }) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url).toBe("https://tsa.invalid/tsr");
      expect(Math.abs(r.genTime.getTime() - Date.now())).toBeLessThan(60_000);
      expect(await verifyTsResponse(r.tsr, anchorDatum(LAST), null)).toMatchObject({ ok: true });
      expect(await verifyTsResponse(r.tsr, anchorDatum("sha256:other"), null)).toMatchObject({ ok: false, reason: "imprint" });
    }
  });
  it("грешен imprint, липсващ nonce, отказ, повреден DER, HTTP грешка → не е котва; втори URL печели", async () => {
    const tsa = await localTsa();
    const digest = anchorDatum(LAST);
    const { der, nonce } = buildTsRequest(anchorDigest(LAST));
    expect(await verifyTsResponse(await tsa.respond(der, { tamperImprint: true }), digest, nonce)).toMatchObject({ ok: false, reason: "imprint" });
    expect(await verifyTsResponse(await tsa.respond(der, { dropNonce: true }), digest, nonce)).toMatchObject({ ok: false, reason: "nonce" });
    expect(await verifyTsResponse(await tsa.respond(der, { status: 2 }), digest, nonce)).toMatchObject({ ok: false, reason: "status" });
    expect(await verifyTsResponse(new Uint8Array([1, 2, 3]), digest, nonce)).toMatchObject({ ok: false, reason: "parse" });
    const good = await tsa.respond(der);
    const flipped = new Uint8Array(good);
    flipped[flipped.length - 5] = (flipped[flipped.length - 5] ?? 0) ^ 0xff; // inside the signature
    expect(await verifyTsResponse(flipped, digest, nonce)).toMatchObject({ ok: false });
    const r = await requestAnchor({
      lastHash: LAST, urls: ["https://a.invalid", "https://b.invalid", "https://c.invalid"],
      fetcher: async (u, body) => (u.startsWith("https://a") ? { status: 503, body: new Uint8Array() } : u.startsWith("https://b") ? Promise.reject(new Error("ENOTFOUND")) : { status: 200, body: await tsa.respond(body) }),
    });
    expect(r).toMatchObject({ ok: true, url: "https://c.invalid" });
    const none = await requestAnchor({ lastHash: LAST, urls: ["https://a.invalid"], fetcher: async () => ({ status: 500, body: new Uint8Array() }) });
    expect(none).toEqual({ ok: false, errors: ["https://a.invalid: HTTP 500"] });
  });
});
