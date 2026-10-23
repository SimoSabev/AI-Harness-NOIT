import { describe, expect, it } from "vitest";
import { d12Ui } from "./d12.js";

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
});
