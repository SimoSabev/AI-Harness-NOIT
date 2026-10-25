import { DesktopUpdateFeedUrl } from "@mandat/contract";

// E9g A5 (D-376, Q-054): electron-updater is wired but OFF. It is turned on only when a feed is configured:
// MANDAT_UPDATE_FEED=github (the default feed: GitHub Releases of SimoSabev/AI-Harness-NOIT) or an https URL of a
// generic feed (latest.yml / latest-mac.yml next to the installers). Unset, empty or anything else → no update check,
// no network call, electron-updater is not even loaded. Never in dev (`pnpm desktop`).

export const DEFAULT_FEED = Object.freeze({ provider: "github", owner: "SimoSabev", repo: "AI-Harness-NOIT" } as const);

export type UpdateFeed = { provider: "github"; owner: string; repo: string } | { provider: "generic"; url: string };


export function updateFeed(env: Record<string, string | undefined>, packaged: boolean): UpdateFeed | null {
  if (!packaged) return null;
  const v = (env.MANDAT_UPDATE_FEED ?? "").trim();
  if (v === "") return null;
  if (v === "github") return { ...DEFAULT_FEED };
  const url = DesktopUpdateFeedUrl.safeParse(v);
  return url.success ? { provider: "generic", url: url.data } : null;
}
