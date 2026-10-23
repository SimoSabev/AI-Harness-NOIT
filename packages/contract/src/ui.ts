import { z } from "zod";

// v5 E9б (D12, D-364): what the browser container writes to /m/out/ui/result.json. It runs next to the agent's code
// (the dev server of tree B), so the file is untrusted input: bounded, strict, parsed here before anything reads it.
const Line = z.string().max(400);
export const UiRouteResult = z
  .object({
    route: z.string().max(200),
    console_errors: z.array(Line).max(50),
    failed_requests: z.array(Line).max(50),
    screenshot: z.string().regex(/^route-[0-4]\.png$/).nullable(),
  })
  .strict();
export type UiRouteResult = z.infer<typeof UiRouteResult>;
export const UiRunResult = z.object({ up: z.boolean(), routes: z.array(UiRouteResult).max(5) }).strict();
export type UiRunResult = z.infer<typeof UiRunResult>;

/** The routes a UI check visits: "/"-rooted paths, no scheme or host (the browser stays on the app's own origin). */
export const UiRoutes = z.array(z.string().regex(/^\/(?!\/)[A-Za-z0-9._~/?=&%-]{0,199}$/)).min(1).max(5);

export function parseUiResult(raw: string | null): UiRunResult | null {
  if (raw === null) return null;
  try {
    const r = UiRunResult.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
