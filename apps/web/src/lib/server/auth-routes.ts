import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { authMode, supabaseServer } from "./auth";
import { db } from "./db";
import { CSRF_COOKIE, checkOrigin } from "./guard";
import { SESSION_COOKIE, SESSION_TTL_S, devLogin, sessionSecret, signSession } from "./session";

// POST /api/auth/login (form) and /api/auth/logout. Origin check; the CSRF cookie (double submit) is set on login.
const back = (req: Request, path: string) => Response.redirect(new URL(path, req.url), 303);

export async function login(req: Request): Promise<Response> {
  if (!checkOrigin(req)) return back(req, "/login?e=origin");
  const form = await req.formData().catch(() => null);
  const email = String(form?.get("email") ?? "").trim();
  const password = String(form?.get("password") ?? "");
  const mode = authMode();
  const jar = await cookies();
  const secure = new URL(req.url).protocol === "https:";
  if (mode === "dev") {
    const uid = await devLogin(db(), email, password);
    if (!uid) return back(req, "/login?e=bad");
    jar.set(SESSION_COOKIE, signSession(uid, sessionSecret()), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: SESSION_TTL_S });
  } else if (mode === "supabase") {
    const { error } = await (await supabaseServer()).auth.signInWithPassword({ email, password });
    if (error) return back(req, "/login?e=bad");
  } else return back(req, "/login?e=off");
  jar.set(CSRF_COOKIE, randomBytes(32).toString("base64url"), { httpOnly: false, sameSite: "strict", secure, path: "/", maxAge: SESSION_TTL_S });
  return back(req, "/");
}

export async function logout(req: Request): Promise<Response> {
  if (!checkOrigin(req) || authMode() === "local") return back(req, "/");
  const jar = await cookies();
  if (authMode() === "supabase") await (await supabaseServer()).auth.signOut();
  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
  return back(req, "/login");
}
