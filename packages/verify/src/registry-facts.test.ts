import { describe, expect, it } from "vitest";
import { registryFacts } from "./registry-facts.js";

// v5 E9б (D8): the license and publish time of a new dependency, from the npm registry on the host (never from the
// sandbox). An exact spec → that version; a range → the latest version (the newest one a fresh install may get).
const packument = { "dist-tags": { latest: "2.1.0" }, versions: { "1.3.0": { license: "MIT" }, "2.1.0": { license: { type: "WTFPL" } } }, time: { "1.3.0": "2020-01-01T00:00:00Z", "2.1.0": "2026-10-22T00:00:00Z" } };

describe("registry facts (D8)", () => {
  it("exact spec → that version; range → latest; the license object form; a scoped name is encoded", async () => {
    const urls: string[] = [];
    const fetch = (u: string) => {
      urls.push(u);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(packument as unknown) });
    };
    expect(await registryFacts([{ name: "left-pad", spec: "1.3.0" }, { name: "@scope/x", spec: "^2.0.0" }], { fetch })).toEqual([
      { name: "left-pad", version: "1.3.0", license: "MIT", published_at: "2020-01-01T00:00:00Z" },
      { name: "@scope/x", version: "2.1.0", license: "WTFPL", published_at: "2026-10-22T00:00:00Z" },
    ]);
    expect(urls).toEqual(["https://registry.npmjs.org/left-pad", "https://registry.npmjs.org/@scope%2fx"]);
  });
  it("a failed or odd answer → facts unknown (null), never an exception", async () => {
    const down = () => Promise.reject(new Error("offline"));
    expect(await registryFacts([{ name: "a", spec: "1.0.0" }], { fetch: down })).toEqual([{ name: "a", version: "1.0.0", license: null, published_at: null }]);
    const notFound = () => Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    expect(await registryFacts([{ name: "a", spec: "^1" }], { fetch: notFound })).toEqual([{ name: "a", version: "^1", license: null, published_at: null }]);
  });
});
