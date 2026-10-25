import { successesToNextLevel } from "@mandat/core";
import { translate } from "../i18n/t";
import type { Lang } from "../i18n/t";

// Demo prompt §8.1: the visible ladder on the card (spec §7).
export function ladderHint(s: { level: number; s_up: number; pinned: boolean }, lang: Lang = "en"): string {
  if (s.pinned) return translate(lang, "ladder.pinned", { level: s.level });
  const n = successesToNextLevel({ level: s.level as 0 | 1 | 2 | 3, s_up: s.s_up, s_down: 0, pinned: false });
  if (n === null) return translate(lang, "ladder.top", { level: s.level });
  return translate(lang, "ladder.next", { level: s.level, n, next: s.level + 1 });
}
