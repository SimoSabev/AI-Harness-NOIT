import { EditorKind } from "@mandat/contract";
import type { DesktopResult, DesktopValue, LocalActivityBody, LocalScope } from "@mandat/contract";

// E9g A3 (AC-12.6, D-373): pure helpers of the web half of local access. Grants live in the desktop app's main process;
// the web only asks over the bridge, and main checks every path again (real path, inside a grant, the right scope).

export const EDITOR_STORAGE_KEY = "mandat.editor";
export const WORKING_COPY_STORAGE_KEY = "mandat.workingCopy";

export function addProjectHref(path?: string): string {
  return path ? `/projects/add?path=${encodeURIComponent(path)}` : "/projects/add";
}

/** The "Add project" suggestion from the path alone (nothing on disk is read before the grant): its name, read only. */
export function suggestProject(path: string): { name: string; scopes: LocalScope[] } {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return { name: parts[parts.length - 1] ?? path, scopes: ["read"] };
}

export function parseEditor(v: unknown): EditorKind {
  const r = EditorKind.safeParse(v);
  return r.success ? r.data : "vscode";
}

/** A diff file (repo-relative) inside the chosen working copy; null for anything that could leave it. */
export function joinLocal(folder: string, rel: string): string | null {
  if (rel === "" || rel.includes("\0") || rel.startsWith("/") || rel.startsWith("\\") || /^[A-Za-z]:/.test(rel)) return null;
  const segs = rel.split(/[\\/]+/);
  if (segs.some((s) => s === ".." || s === "")) return null;
  const win = /^[A-Za-z]:[\\/]/.test(folder);
  const sep = win ? "\\" : "/";
  return `${folder.replace(/[\\/]+$/, "")}${sep}${segs.join(sep)}`;
}

/** The task_activities row for a local action; null when the person cancelled (nothing happened). */
export function activityFor(kind: "local_apply", r: DesktopResult<DesktopValue<"applyLocal">>): LocalActivityBody | null;
export function activityFor(kind: "local_editor", r: DesktopResult<DesktopValue<"openInEditor">>, file: string): LocalActivityBody | null;
export function activityFor(kind: LocalActivityBody["kind"], r: DesktopResult<unknown>, file?: string): LocalActivityBody | null {
  if (!r.ok) return r.error.code === "cancelled" ? null : { kind, outcome: "failed", detail: r.error.code };
  if (kind === "local_editor") return { kind, outcome: "opened", ...(file ? { detail: file.slice(0, 300) } : {}) };
  const v = r.value as DesktopValue<"applyLocal">;
  const detail = v.status === "refused" ? v.detail : v.head?.slice(0, 12);
  return { kind, outcome: v.status, ...(detail ? { detail: detail.slice(0, 300) } : {}) };
}
