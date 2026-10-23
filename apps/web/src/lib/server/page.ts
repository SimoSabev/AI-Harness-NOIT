import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authMode, currentUser } from "./auth";
import { db } from "./db";
import { CSRF_COOKIE } from "./guard";
import { inbox, membership } from "./queries";
import type { Role } from "./queries";

// Server Components: the signed-in user + org, or a redirect to /login.
export interface PageCtx { uid: string; org: string; role: Role; waiting: number; realtime: { url: string; anonKey: string } | null }

export async function pageCtx(): Promise<PageCtx> {
  const uid = await currentUser();
  if (!uid) redirect("/login");
  // D-368: no login form in `pnpm local` — the CSRF cookie the login used to set comes from /api/auth/local
  if (authMode() === "local" && !(await cookies()).get(CSRF_COOKIE)) redirect("/api/auth/local");
  const m = await membership(db(), uid);
  if (!m) redirect("/login?e=no_org");
  const ib = await inbox(db(), uid, m.org_id);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { uid, org: m.org_id, role: m.role, waiting: ib.items.length, realtime: authMode() === "supabase" && url && anonKey ? { url, anonKey } : null };
}

export const canAct = (r: Role) => r === "owner" || r === "approver";
