import { describe, expect, it } from "vitest";
import { VISUAL_DIFF_THRESHOLD, d12Ui } from "./d12.js";

// v5 E9б (5.2, AC-5.5): D12 — the changed UI rendered by a browser in the verification network. A console error or a
// failed request on a route → a human looks (unknown, with the screenshots on the card); no UI path touched → n/a.
describe("D12 UI (E9б)", () => {
  it("no UI path in the change → n/a; no browser results → unknown not_run", () => {
    expect(d12Ui({ uiTouched: false, routes: null }).evidence.status).toBe("n/a");
    expect(d12Ui({ uiTouched: true, routes: null }).evidence).toMatchObject({ status: "unknown", signature: "D12:not_run:-" });
  });
  it("clean routes → pass; a console error → unknown D12:console_error:<route>; a failed request → unknown D12:failed_request:<route>", () => {
    const clean = { route: "/", console_errors: [], failed_requests: [], screenshot: "ui/root.png" };
    expect(d12Ui({ uiTouched: true, routes: [clean] }).evidence).toMatchObject({ status: "pass", data: { routes: [{ route: "/", screenshot: "ui/root.png" }] } });
    const err = d12Ui({ uiTouched: true, routes: [clean, { route: "/cart", console_errors: ["TypeError: x is undefined"], failed_requests: [], screenshot: "ui/cart.png" }] }).evidence;
    expect(err).toMatchObject({ status: "unknown", signature: "D12:console_error:/cart" });
    expect(err.summary).toBe("1 route(s) with console errors or failed requests");
    expect(d12Ui({ uiTouched: true, routes: [{ ...clean, failed_requests: ["GET /api 500"] }] }).evidence.signature).toBe("D12:failed_request:/");
  });
  it("visual diff against base: over the threshold → unknown D12:visual_diff:<route> with the before/after shots; errors win; no base shot → no visual verdict", () => {
    const r = { route: "/", console_errors: [], failed_requests: [], screenshot: "ui/route-0.png" };
    expect(d12Ui({ uiTouched: true, routes: [{ ...r, visual_diff: VISUAL_DIFF_THRESHOLD / 2, base_screenshot: "ui/base-route-0.png" }] }).evidence.status).toBe("pass");
    const big = d12Ui({ uiTouched: true, routes: [{ ...r, visual_diff: 0.2, base_screenshot: "ui/base-route-0.png" }] }).evidence;
    expect(big).toMatchObject({ status: "unknown", signature: "D12:visual_diff:/", data: { routes: [{ visual_diff: 0.2, base_screenshot: "ui/base-route-0.png" }] } });
    expect(big.summary).toBe("1 route(s) look different from base (a human compares before/after)");
    const both = d12Ui({ uiTouched: true, routes: [{ ...r, route: "/a", visual_diff: 0.5 }, { ...r, route: "/b", console_errors: ["x"] }] }).evidence;
    expect(both.signature).toBe("D12:console_error:/b");
    expect(d12Ui({ uiTouched: true, routes: [{ ...r, visual_diff: null }] }).evidence.status).toBe("pass");
  });
});

