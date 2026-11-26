import type { SubscriptionStatus } from "@mandat/contract";

// D-500: Settings → Connections — the tiles that show what is connected and lead to each part. Pure: the page and the
// test share it. Only facts count: a signed-in subscription, a saved key or local server, an approved tool or skill.

export type TileId = "subscriptions" | "api-keys" | "tools" | "models" | "account";
/** ok: something works · empty: nothing yet · attention: something needs the person · optional: sign-in is not needed ·
 * unavailable: this part lives in `pnpm local` / the desktop only */
export type TileState = "ok" | "empty" | "attention" | "optional" | "unavailable";
export interface Tile { id: TileId; href: string; count: number | null; state: TileState }

export interface HubInput {
  /** `pnpm local` or the desktop: subscriptions, keys, models and the profile live on this computer */
  local: boolean;
  subscriptions: readonly { status: SubscriptionStatus }[];
  keys: readonly { hasKey: boolean; kind: "subscription" | "api_key" | "local" }[];
  servers: readonly { vet_status: string }[];
  skills: readonly { approved: boolean }[];
  models: number;
  /** D-625: "hidden" = no sync server and not signed in — the tile is left out */
  account: "hidden" | "off" | "signed_in";
}

const HREF: Record<TileId, string> = {
  subscriptions: "/settings/subscriptions",
  "api-keys": "/settings/api-keys",
  tools: "/settings/tools",
  models: "/settings/models",
  account: "/settings/account",
};

const counted = (count: number, attention: boolean): Pick<Tile, "count" | "state"> =>
  ({ count, state: attention ? "attention" : count > 0 ? "ok" : "empty" });

export function connectionTiles(i: HubInput): Tile[] {
  const tile = (id: TileId, v: Pick<Tile, "count" | "state">): Tile => ({ id, href: HREF[id], ...v });
  const off = { count: null, state: "unavailable" as const };
  const subsOn = i.subscriptions.filter((s) => s.status === "signed_in").length;
  const subsBad = i.subscriptions.some((s) => s.status === "expired");
  const keys = i.keys.filter((k) => (k.kind === "api_key" && k.hasKey) || k.kind === "local").length;
  const tools = i.servers.filter((s) => s.vet_status === "approved").length + i.skills.filter((s) => s.approved).length;
  const toolsBad = i.servers.some((s) => s.vet_status === "blocked");
  return [
    tile("subscriptions", i.local ? counted(subsOn, subsBad) : off),
    tile("api-keys", i.local ? counted(keys, false) : off),
    tile("tools", counted(tools, toolsBad)),
    tile("models", i.local ? counted(i.models, false) : off),
    ...(i.local && i.account === "hidden" ? [] : [tile("account", !i.local ? off : { count: null, state: i.account === "signed_in" ? "ok" : "optional" })]),
  ];
}
