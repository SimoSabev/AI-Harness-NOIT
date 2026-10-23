import { describe, expect, it } from "vitest";
import { UiRoutes, parseUiResult } from "./index.js";

describe("the D12 result file (D-364)", () => {
  it("parses a good file; anything malformed, oversized or with a foreign screenshot name → null", () => {
    const good = { up: true, routes: [{ route: "/", console_errors: ["x"], failed_requests: [], screenshot: "route-0.png" }] };
    expect(parseUiResult(JSON.stringify(good))).toEqual(good);
    expect(parseUiResult(null)).toBeNull();
    expect(parseUiResult("{x")).toBeNull();
    expect(parseUiResult(JSON.stringify({ ...good, extra: 1 }))).toBeNull();
    expect(parseUiResult(JSON.stringify({ up: true, routes: [{ ...good.routes[0], screenshot: "../../etc/passwd" }] }))).toBeNull();
    expect(parseUiResult(JSON.stringify({ up: true, routes: Array.from({ length: 6 }, () => good.routes[0]) }))).toBeNull();
    expect(parseUiResult(JSON.stringify({ up: true, routes: [{ ...good.routes[0], console_errors: ["a".repeat(401)] }] }))).toBeNull();
  });
  it("visual_diff is a share 0..1 or null (no base screenshot); absent in older files", () => {
    const r = { route: "/", console_errors: [], failed_requests: [], screenshot: "route-0.png" };
    expect(parseUiResult(JSON.stringify({ up: true, routes: [{ ...r, visual_diff: 0.25 }] }))?.routes[0]?.visual_diff).toBe(0.25);
    expect(parseUiResult(JSON.stringify({ up: true, routes: [{ ...r, visual_diff: null }] }))).not.toBeNull();
    expect(parseUiResult(JSON.stringify({ up: true, routes: [{ ...r, visual_diff: 2 }] }))).toBeNull();
  });
  it("routes stay on the app's origin", () => {
    expect(UiRoutes.safeParse(["/", "/cart?x=1"]).success).toBe(true);
    for (const bad of [[], ["http://evil"], ["//evil.example"], ["cart"], ["/", "/", "/", "/", "/", "/"]]) expect(UiRoutes.safeParse(bad).success).toBe(false);
  });
});
