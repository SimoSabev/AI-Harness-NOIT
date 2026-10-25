import { describe, expect, it } from "vitest";
import { uiShotsView } from "./ui-shots";

// E9b (D12): the card's before/after per route — only names the changeset actually has; a broken data blob shows nothing.
describe("uiShotsView", () => {
  const ev = (data: unknown) => [{ detector: "D12.ui", status: "unknown", summary: "", data: data as Record<string, unknown>, signature: "D12:visual_diff:/" }];
  it("routes with before/after URLs, the diff share and the errors", () => {
    const v = uiShotsView("cs-1", ev({ routes: [{ route: "/", console_errors: ["boom"], failed_requests: [], screenshot: "ui/route-0.png", base_screenshot: "ui/base-route-0.png", visual_diff: 0.2 }, { route: "/cart", console_errors: [], failed_requests: ["GET /x 404"], screenshot: "ui/route-1.png", base_screenshot: null, visual_diff: null }] }), ["base-route-0.png", "route-0.png"]);
    expect(v).toEqual([
      { route: "/", errors: ["boom"], after: "/api/changesets/cs-1/shots/route-0.png", before: "/api/changesets/cs-1/shots/base-route-0.png", diff: 0.2 },
      { route: "/cart", errors: ["GET /x 404"], after: null, before: null, diff: null },
    ]);
  });
  it("no D12 evidence, no changeset, no screenshot the user may see (viewer) or a malformed blob → nothing", () => {
    expect(uiShotsView("cs-1", ev({ routes: [{ route: "/", console_errors: [], failed_requests: [], screenshot: "ui/route-0.png" }] }), [])).toEqual([]);
    expect(uiShotsView("cs-1", [], ["route-0.png"])).toEqual([]);
    expect(uiShotsView(null, ev({ routes: [] }), [])).toEqual([]);
    expect(uiShotsView("cs-1", ev({ routes: [{ route: 1 }] }), ["route-0.png"])).toEqual([]);
  });
});
