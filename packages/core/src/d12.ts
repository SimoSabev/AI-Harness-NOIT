import type { Detected } from "./canary.js";
import { ev } from "./evidence.js";

// v5 E9б (5.2, AC-5.5): D12 UI. The browser's findings on tree B's app (run in the verification network, never the
// internet). A console error or a failed request → unknown (a human looks at the screenshots); never fail on its own.
export interface UiRoute { route: string; console_errors: string[]; failed_requests: string[]; screenshot: string | null }

export function d12Ui(o: { uiTouched: boolean; routes: UiRoute[] | null }): Detected {
  if (!o.uiTouched) return { evidence: ev("D12.ui", "n/a", "no UI path in the change"), security: [] };
  if (o.routes === null || o.routes.length === 0) return { evidence: ev("D12.ui", "unknown", "the UI check did not run", {}, { cls: "not_run", id: "-" }), security: [] };
  const routes = o.routes.map((r) => ({ route: r.route, console_errors: r.console_errors.slice(0, 10).map((x) => x.slice(0, 300)), failed_requests: r.failed_requests.slice(0, 10).map((x) => x.slice(0, 300)), screenshot: r.screenshot }));
  const bad = routes.filter((r) => r.console_errors.length > 0 || r.failed_requests.length > 0);
  if (bad.length === 0) return { evidence: ev("D12.ui", "pass", `${routes.length} route(s) rendered without errors`, { routes }), security: [] };
  const first = bad[0] as (typeof routes)[number];
  return { evidence: ev("D12.ui", "unknown", `${bad.length} route(s) with console errors or failed requests`, { routes }, { cls: first.console_errors.length > 0 ? "console_error" : "failed_request", id: first.route }), security: [] };
}
