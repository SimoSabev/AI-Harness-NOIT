import { z } from "zod";
import { TaskId } from "./schemas.js";

// E9g A1 (D-371): every message between the Electron main process (apps/desktop) and the web UI (apps/web) in the
// desktop window. The web asks through window.harnessDesktop (the preload), main answers; main sends commands back on one
// event channel. Both ends parse with these schemas; nothing else crosses. The agent in the sandbox never sees any of it.

/** An absolute local path (POSIX or a Windows drive path); no NUL, no UNC share. Resolving symlinks is main's job (A3). */
export const LocalPath = z
  .string()
  .min(1)
  .max(4096)
  .refine((p) => !p.includes("\0"), "NUL in path")
  .refine((p) => /^\/(?!\/)/.test(p) || /^[A-Za-z]:[\\/]/.test(p), "not an absolute local path");
export type LocalPath = z.infer<typeof LocalPath>;

/** What a folder grant allows (docs/tasks/e9g.md A3): make a project, apply a change, open a file in an editor, a host terminal. */
export const LocalScope = z.enum(["read", "apply", "open_editor", "terminal"]);
export type LocalScope = z.infer<typeof LocalScope>;

const Scopes = z
  .array(LocalScope)
  .min(1)
  .max(4)
  .refine((s) => new Set(s).size === s.length, "duplicate scope");

/** A folder the person gave the app, with the rights given. Stored only by the main process (the profile folder). */
export const LocalGrant = z.object({ path: LocalPath, scopes: Scopes, granted_at: z.string().datetime() }).strict();
export type LocalGrant = z.infer<typeof LocalGrant>;

export const EditorKind = z.enum(["vscode", "cursor", "zed"]);
export type EditorKind = z.infer<typeof EditorKind>;

const Count = z.number().int().min(0).max(99_999);
const Empty = z.object({}).strict();

/** Each method: what the web sends and what main answers (the value inside the envelope). */
export const DESKTOP_METHODS = {
  pickFolder: { request: Empty, response: z.object({ path: LocalPath.nullable() }).strict() },
  grantsList: { request: Empty, response: z.object({ grants: z.array(LocalGrant).max(500) }).strict() },
  grant: { request: z.object({ path: LocalPath, scopes: Scopes }).strict(), response: z.object({ grant: LocalGrant }).strict() },
  /** without scopes: the whole folder is forgotten */
  revoke: { request: z.object({ path: LocalPath, scopes: Scopes.optional() }).strict(), response: z.object({ grants: z.array(LocalGrant).max(500) }).strict() },
  openInEditor: {
    request: z.object({ path: LocalPath, line: z.number().int().min(1).max(10_000_000).optional(), editor: EditorKind }).strict(),
    response: Empty,
  },
  /** `mandat apply --task <id>` in the working copy at path: a fast-forward merge only, nothing destructive (T3-7) */
  applyLocal: {
    request: z.object({ task_id: TaskId, path: LocalPath }).strict(),
    response: z.object({ status: z.enum(["applied", "up_to_date", "refused"]), head: z.string().regex(/^[0-9a-f]{40,64}$/).nullable(), detail: z.string().max(2000).optional() }).strict(),
  },
  notify: { request: z.object({ title: z.string().min(1).max(120), body: z.string().max(500), task_id: TaskId.optional() }).strict(), response: Empty },
  /** the number on the dock / taskbar icon */
  badge: { request: z.object({ count: Count }).strict(), response: Empty },
  /** "waiting for you" in the tray */
  inboxCount: { request: z.object({ count: Count }).strict(), response: Empty },
} as const;

export type DesktopMethod = keyof typeof DESKTOP_METHODS;
export const DESKTOP_METHOD_NAMES = Object.keys(DESKTOP_METHODS) as DesktopMethod[];
export type DesktopRequest<M extends DesktopMethod> = z.infer<(typeof DESKTOP_METHODS)[M]["request"]>;
export type DesktopValue<M extends DesktopMethod> = z.infer<(typeof DESKTOP_METHODS)[M]["response"]>;

export const DesktopErrorCode = z.enum(["invalid_request", "invalid_response", "unknown_channel", "denied", "not_granted", "not_ready", "cancelled", "failed"]);
export type DesktopErrorCode = z.infer<typeof DesktopErrorCode>;
export const DesktopError = z.object({ code: DesktopErrorCode, message: z.string().max(2000) }).strict();
export type DesktopError = z.infer<typeof DesktopError>;
export type DesktopResult<T> = { ok: true; value: T } | { ok: false; error: DesktopError };

const CHANNEL_PREFIX = "harness:";
/** main → web: one channel for every command (menu, shortcuts, a notification click). */
export const DESKTOP_EVENT_CHANNEL = "harness:event";

export function desktopChannel(m: DesktopMethod): string {
  return `${CHANNEL_PREFIX}${m}`;
}

export function desktopMethodOf(channel: unknown): DesktopMethod | null {
  if (typeof channel !== "string" || !channel.startsWith(CHANNEL_PREFIX)) return null;
  const m = channel.slice(CHANNEL_PREFIX.length);
  return Object.hasOwn(DESKTOP_METHODS, m) ? (m as DesktopMethod) : null;
}

const isMethod = (m: string): m is DesktopMethod => Object.hasOwn(DESKTOP_METHODS, m);
const issue = (e: z.ZodError): string => e.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ").slice(0, 2000);

export function parseDesktopRequest<M extends DesktopMethod>(method: M, raw: unknown): DesktopResult<DesktopRequest<M>>;
export function parseDesktopRequest(method: string, raw: unknown): DesktopResult<unknown>;
export function parseDesktopRequest(method: string, raw: unknown): DesktopResult<unknown> {
  if (!isMethod(method)) return { ok: false, error: { code: "invalid_request", message: "unknown method" } };
  const r = DESKTOP_METHODS[method].request.safeParse(raw);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: { code: "invalid_request", message: issue(r.error) } };
}

/** The envelope main sends back. Anything malformed becomes an invalid_response error, never a value. */
export function parseDesktopResponse<M extends DesktopMethod>(method: M, raw: unknown): DesktopResult<DesktopValue<M>>;
export function parseDesktopResponse(method: string, raw: unknown): DesktopResult<unknown>;
export function parseDesktopResponse(method: string, raw: unknown): DesktopResult<unknown> {
  if (!isMethod(method)) return { ok: false, error: { code: "invalid_response", message: "unknown method" } };
  const env = z
    .union([z.object({ ok: z.literal(true), value: DESKTOP_METHODS[method].response }).strict(), z.object({ ok: z.literal(false), error: DesktopError }).strict()])
    .safeParse(raw);
  return env.success ? (env.data as DesktopResult<unknown>) : { ok: false, error: { code: "invalid_response", message: issue(env.error) } };
}

export const DesktopView = z.enum(["inbox", "board", "agents", "tools", "night", "research"]);
export type DesktopView = z.infer<typeof DesktopView>;

/** main → web: what the menu, a shortcut or a notification click asks the UI to do. */
export const DesktopCommand = z.discriminatedUnion("command", [
  z.object({ command: z.literal("new_task") }).strict(),
  z.object({ command: z.literal("add_project"), path: LocalPath.optional() }).strict(),
  z.object({ command: z.literal("apply_locally") }).strict(),
  z.object({ command: z.literal("approve") }).strict(),
  z.object({ command: z.literal("search") }).strict(),
  z.object({ command: z.literal("shortcuts") }).strict(),
  z.object({ command: z.literal("view"), view: DesktopView }).strict(),
  z.object({ command: z.literal("open_project"), index: z.number().int().min(1).max(9) }).strict(),
  z.object({ command: z.literal("open_task"), task_id: TaskId }).strict(),
]);
export type DesktopCommand = z.infer<typeof DesktopCommand>;

/**
 * E9g A2: what main reads from the web's existing GET /api/inbox for the tray counter and the "waiting for you"
 * notifications — only the id and the text of each waiting item; every other field is dropped.
 */
export const DesktopInboxSnapshot = z.object({ items: z.array(z.object({ id: TaskId, text: z.string().max(100_000) })).max(500) });
export type DesktopInboxSnapshot = z.infer<typeof DesktopInboxSnapshot>;

// E9g A3 (AC-12.6, "local permissions and edits"): the grants, the local apply and the trail of local actions.

/** The file in MANDAT_HOME (the harness profile folder) where main keeps the grants; nothing else reads it. */
export const LOCAL_GRANTS_FILE = "local-grants.json";
export const LocalGrantsFile = z.object({ version: z.literal(1), grants: z.array(LocalGrant).max(500) }).strict();
export type LocalGrantsFile = z.infer<typeof LocalGrantsFile>;

/** What `mandat --json apply --task <id> --repo <path>` prints (packages/cli/src/commands/apply.ts, D-356). */
export const MandatApplyJson = z.union([
  z.object({ ok: z.literal(true), ref: z.string().min(1).max(200), head: z.string().regex(/^[0-9a-f]{40,64}$/), files: z.array(z.string().max(4096)).max(100_000) }),
  z.object({ ok: z.literal(false), reason: z.enum(["no_branch", "not_a_repo", "diverged", "local_changes", "merge_refused"]), detail: z.string().max(2000).optional() }),
]);
export type MandatApplyJson = z.infer<typeof MandatApplyJson>;

/** preload → main: a folder dropped on the window (AC-12.6). Not a method: the page cannot send it, only the preload's drop listener. */
export const DESKTOP_DROP_CHANNEL = "harness:drop";
export const DesktopDrop = z.object({ path: LocalPath }).strict();
export type DesktopDrop = z.infer<typeof DesktopDrop>;

/** web → its own API: one local action for task_activities (not the ledger). The server writes the text itself. */
export const LocalActivityBody = z
  .object({
    kind: z.enum(["local_apply", "local_editor"]),
    outcome: z.enum(["applied", "up_to_date", "refused", "opened", "failed"]),
    detail: z.string().max(300).optional(),
  })
  .strict();
export type LocalActivityBody = z.infer<typeof LocalActivityBody>;
