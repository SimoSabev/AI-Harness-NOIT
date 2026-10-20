import { describe, expect, it } from "vitest";
import { RateLimiter, checkOrigin, checkCsrf, readJsonBody, MAX_BODY } from "./guard";

const req = (h: Record<string, string>, body?: string) => new Request("http://localhost:3000/api/x", { method: "POST", headers: h, ...(body !== undefined ? { body } : {}) });

describe("guard (спец. т. 12)", () => {
  it("Origin: само собственият; липсващ → отказ", () => {
    expect(checkOrigin(req({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
    expect(checkOrigin(req({ origin: "https://evil.example", host: "localhost:3000" }))).toBe(false);
    expect(checkOrigin(req({ host: "localhost:3000" }))).toBe(false);
    expect(checkOrigin(req({ origin: "https://mandat.example" }), "https://mandat.example")).toBe(true);
  });
  it("CSRF: бисквитка = заглавка, ≥ 32 знака", () => {
    const t = "a".repeat(43);
    expect(checkCsrf(req({ cookie: `mandat_csrf=${t}`, "x-mandat-csrf": t }))).toBe(true);
    expect(checkCsrf(req({ cookie: `mandat_csrf=${t}`, "x-mandat-csrf": "b".repeat(43) }))).toBe(false);
    expect(checkCsrf(req({ "x-mandat-csrf": t }))).toBe(false);
    expect(checkCsrf(req({ cookie: "mandat_csrf=short", "x-mandat-csrf": "short" }))).toBe(false);
  });
  it("тяло ≤ 1 MB, валиден JSON", async () => {
    expect(await readJsonBody(req({}, '{"a":1}'))).toEqual({ ok: true, value: { a: 1 } });
    expect(await readJsonBody(req({}, "x".repeat(MAX_BODY + 1)))).toEqual({ ok: false, status: 413 });
    expect(await readJsonBody(req({ "content-length": String(MAX_BODY + 5) }, "{}"))).toEqual({ ok: false, status: 413 });
    expect(await readJsonBody(req({}, "{nope"))).toEqual({ ok: false, status: 400 });
  });
  it("лимит 10/мин на ключ", () => {
    let t = 0;
    const rl = new RateLimiter(10, 60_000, () => t);
    for (let i = 0; i < 10; i++) expect(rl.take("u")).toBe(true);
    expect(rl.take("u")).toBe(false);
    expect(rl.take("v")).toBe(true);
    t = 60_001;
    expect(rl.take("u")).toBe(true);
  });
});
