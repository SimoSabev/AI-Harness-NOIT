// E9g B (D-377): which installer to offer first. Only the browser's own hints (navigator), read in the page; nothing is
// sent anywhere. Phones and tablets get the web app (PWA, D-289): there is no phone installer.
export type Os = "mac" | "windows" | "linux" | "phone" | "unknown";
/** A system with a desktop installer. */
export type Platform = "mac" | "windows" | "linux";

export interface OsHints {
  userAgent: string;
  /** navigator.userAgentData.platform (Chromium), when present. */
  platform?: string | undefined;
  /** navigator.userAgentData.mobile, when present. */
  mobile?: boolean | undefined;
  /** navigator.maxTouchPoints: an iPad with desktop Safari says "Macintosh" but has touch. */
  maxTouchPoints?: number | undefined;
}

export function detectOs(h: OsHints): Os {
  if (h.mobile === true) return "phone";
  if (h.platform) {
    const p = h.platform.toLowerCase();
    if (p === "android" || p === "ios") return "phone";
    if (p === "macos") return "mac";
    if (p === "windows") return "windows";
    if (p === "linux") return "linux";
  }
  const ua = h.userAgent;
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return "phone";
  if (/Macintosh|Mac OS X/i.test(ua)) return (h.maxTouchPoints ?? 0) > 1 ? "phone" : "mac";
  if (/Windows NT/i.test(ua)) return "windows";
  if (/Linux|X11/i.test(ua) && !/CrOS/i.test(ua)) return "linux";
  return "unknown";
}

/** The section id on /download for a system (the home button links to /download/#<id>). Kept here, not in downloads.ts,
 *  so the browser bundle of the button does not pull in the manifest and zod. */
export function platformAnchor(os: Exclude<Os, "unknown">): string {
  return os;
}
