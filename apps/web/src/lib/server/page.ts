import "server-only";
import { redirect } from "next/navigation";
import { authMode, currentUser } from "./auth";
import { db } from "./db";
import { cache } from "react";
import { getLang } from "../../i18n/server";
import { translator } from "../../i18n/t";
import type { Lang } from "../../i18n/t";
import type { WsTask } from "../../components/workspace";
import { homeQueue } from "../home";
import { membership } from "./queries";
import { workspaceList } from "./workspace-list";
import type { Role } from "./queries";

// Server Components: the signed-in user + org, or a redirect to /login.
export interface PageCtx { uid: string; org: string; role: Role; waiting: number; realtime: { url: string; anonKey: string } | null }

export async function pageCtx(): Promise<PageCtx> {
  const uid = await currentUser();
  if (!uid) redirect("/login");
  const m = await membership(db(), uid);
  if (!m) redirect("/login?e=no_org");
  // D-624: the badge and the window title count the list's own waiting rows (a job is one row, a conversation counts)
  const waiting = homeQueue(await requestList(uid, m.org_id, await getLang())).counts.waiting;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { uid, org: m.org_id, role: m.role, waiting, realtime: authMode() === "supabase" && url && anonKey ? { url, anonKey } : null };
}

export const canAct = (r: Role) => r === "owner" || r === "approver";

/** D-624: the workspace's list, built once per request — the tasks page and the frame's badge read the same one */
export const requestList = cache((uid: string, org: string, lang: Lang): Promise<WsTask[]> => workspaceList(db(), uid, org, translator(lang)));
