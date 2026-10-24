import { SiteShotList } from "@mandat/contract";
import raw from "../../shots.json";
import type { Lang } from "../i18n/t";

// E9g B step 7 (D-378): the real UI screenshots, made by scripts/site-shots.mjs from the screens listed in shots.json
// (checked with the contract's schema, like releases.json).
const list = SiteShotList.parse(raw);
export const SHOT_NAMES: readonly string[] = list.shots.map((s) => s.name);
export const SHOT_SIZE = list.viewport;
export type Theme = "dark" | "light";

export function shotSrc(name: string, lang: Lang, theme: Theme): string {
  return `/shots/${name}-${lang}-${theme}.png`;
}
