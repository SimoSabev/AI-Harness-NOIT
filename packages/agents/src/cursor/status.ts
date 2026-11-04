import { obj, parseJson } from "../stream-util.js";

// D-464 (spike 04.11.2026 §6): `agent status --format json` exits 0 for every status, so the login state comes from
// isAuthenticated (true only as a boolean). The unauthenticated shape is verified; the authenticated one (userInfo.email)
// is from source js/2576.index.js [НП: a live login]. Pure, never throws; prints no token.
export interface CursorStatus { loggedIn: boolean; email: string | null }

export function parseCursorStatus(stdout: string): CursorStatus {
  const j = parseJson(stdout.trim());
  if (!j || j.isAuthenticated !== true) return { loggedIn: false, email: null };
  const email = obj(j.userInfo).email;
  return { loggedIn: true, email: typeof email === "string" && email.length > 0 ? email : null };
}
