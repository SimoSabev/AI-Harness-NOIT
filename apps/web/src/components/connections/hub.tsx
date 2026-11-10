import Link from "next/link";
import type { Key } from "../../i18n/en";
import type { T } from "../../i18n/t";
import type { Tile, TileState } from "./hub-view";

// D-500: Settings → Connections — one tile per part, each with what is connected now and a link to its page.
const TONE: Record<TileState, string> = {
  ok: "border-ok/40 bg-ok-soft text-ok",
  empty: "border-line text-mute",
  attention: "border-warn/40 bg-warn-soft text-warn",
  optional: "border-line text-mute",
  unavailable: "border-line text-mute",
};

function status(t: T, tile: Tile): string {
  if (tile.state === "attention" || tile.state === "unavailable" || tile.state === "optional") return t(`hub.state.${tile.state}`);
  if (tile.count === null) return t(`hub.state.${tile.state}`);
  return tile.count === 0 ? t("hub.state.empty") : t.n("hub.count", tile.count, { n: tile.count });
}

export function ConnectionsHub({ t, tiles }: { t: T; tiles: Tile[] }) {
  return (
    <section aria-labelledby="s-connections" className="mt-8">
      <h2 id="s-connections" className="font-display text-xl font-semibold tracking-tight">{t("hub.title")}</h2>
      <p className="mt-1 max-w-2xl text-sm text-mute">{t("hub.intro")}</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.id} className="min-w-0">
            <Link
              href={tile.href}
              className="group flex h-full flex-col gap-2 rounded-xl border border-line bg-panel p-4 transition-colors hover:border-accent focus-visible:border-accent focus-visible:outline-none"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="font-display text-base font-semibold">{t(`hub.${tile.id}.title` as Key)}</span>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${TONE[tile.state]}`}>{status(t, tile)}</span>
              </span>
              <span className="text-sm text-mute">{t(`hub.${tile.id}.hint` as Key)}</span>
              <span className="mt-auto text-sm text-accent underline-offset-4 group-hover:underline">{t("hub.open")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
