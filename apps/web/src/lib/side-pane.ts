// D-620: the list of conversations beside the work — folded away or as wide as the person dragged it. The state is one
// cookie ("312", "folded:312"), so the server draws the right width from the first byte.
export const SIDE_MIN = 200;
export const SIDE_MAX = 440;
export const SIDE_DEFAULT = 264;
export const SIDE_COOKIE = "side";
export interface SideState { folded: boolean; width: number }

export const clampSide = (w: number): number => Math.round(Math.min(SIDE_MAX, Math.max(SIDE_MIN, w)));

export function parseSide(v: string | undefined): SideState {
  const m = /^(folded)?(?::?(\d{1,5}))?$/.exec(v ?? "");
  if (!m || (v ?? "") === "") return { folded: false, width: SIDE_DEFAULT };
  return { folded: m[1] !== undefined, width: m[2] === undefined ? SIDE_DEFAULT : clampSide(Number(m[2])) };
}

export const sideCookie = (s: SideState): string => (s.folded ? `folded:${clampSide(s.width)}` : String(clampSide(s.width)));

/** D-621: the box is one line when empty, grows with its text, and scrolls past the cap */
export const COMPOSER_LINE = 24;
export const composerHeight = (scroll: number, cap: number): number => Math.min(cap, Math.max(COMPOSER_LINE, scroll));
