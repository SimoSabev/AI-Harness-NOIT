import { z } from "zod";

// E9b (D12, D-364): the card's view of the UI check — per route the before (base) and after (B) screenshot URLs that the
// changeset actually has, the share of pixels that changed and the console errors / failed requests (shown as text).
const Route = z.object({
  route: z.string().max(200),
  console_errors: z.array(z.string()).max(50),
  failed_requests: z.array(z.string()).max(50),
  screenshot: z.string().nullable(),
  base_screenshot: z.string().nullable().optional(),
  visual_diff: z.number().min(0).max(1).nullable().optional(),
});
const Data = z.object({ routes: z.array(Route).max(5) });

export interface UiShotRow { route: string; errors: string[]; before: string | null; after: string | null; diff: number | null }

export function uiShotsView(changesetId: string | null, evidence: { detector: string; data: Record<string, unknown> }[], names: string[]): UiShotRow[] {
  const e = evidence.find((x) => x.detector === "D12.ui");
  const d = e ? Data.safeParse(e.data) : null;
  if (!changesetId || !d?.success || names.length === 0) return [];
  const have = new Set(names);
  const url = (p: string | null | undefined) => {
    const n = p?.replace(/^ui\//, "") ?? null;
    return n !== null && have.has(n) ? `/api/changesets/${changesetId}/shots/${n}` : null;
  };
  return d.data.routes.map((r) => ({ route: r.route, errors: [...r.console_errors, ...r.failed_requests].slice(0, 10), after: url(r.screenshot), before: url(r.base_screenshot), diff: r.visual_diff ?? null }));
}
