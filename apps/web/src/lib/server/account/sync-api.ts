import { MandatError, SyncPushRequest, WrappedVaultKey } from "@mandat/contract";
import type { SyncServer } from "@mandat/sync";
import { z } from "zod";
import { readJsonBody } from "../guard";

// D-491: the sync server's HTTP face: POST /api/sync/{pull,push,vault,wipe}, GET /api/sync/vault. Only a device's
// bearer session token gets in (never a cookie, so a page in a browser cannot ride on it: no CSRF surface). The person
// is the session's user; nothing in the body can name another one.
export type SyncOp = "pull" | "push" | "vault" | "wipe";
export const SYNC_OPS: readonly SyncOp[] = ["pull", "push", "vault", "wipe"];

export interface SyncApiDeps {
  server: SyncServer;
  /** the user id of a valid bearer session, else null */
  userOf: (req: Request) => Promise<string | null>;
  /** after a wipe: also delete the person's sign-in record */
  deleteUser?: (req: Request) => Promise<void>;
}

const json = (status: number, body: unknown): Response => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const PullBody = z.object({ since: z.number().int().min(0) }).strict();

export async function handleSync(op: string, req: Request, d: SyncApiDeps): Promise<Response> {
  if (!SYNC_OPS.includes(op as SyncOp)) return json(404, { error: "not_found" });
  if (req.headers.get("cookie") && !req.headers.get("authorization")) return json(401, { error: "bearer_only" });
  const uid = await d.userOf(req);
  if (!uid) return json(401, { error: "signed_out" });
  if (op === "vault" && req.method === "GET") return json(200, { wrapped: await d.server.getVault(uid) });
  if (req.method !== "POST") return json(405, { error: "method" });
  const body = await readJsonBody(req);
  if (!body.ok) return json(body.status, { error: "body" });
  try {
    if (op === "pull") {
      const p = PullBody.safeParse(body.value);
      return p.success ? json(200, await d.server.pull(uid, p.data.since)) : json(400, { error: "body" });
    }
    if (op === "push") {
      const p = SyncPushRequest.safeParse(body.value);
      return p.success ? json(200, await d.server.push(uid, p.data.changes)) : json(400, { error: "body" });
    }
    if (op === "vault") {
      const p = z.object({ wrapped: WrappedVaultKey }).strict().safeParse(body.value);
      if (!p.success) return json(400, { error: "body" });
      await d.server.putVault(uid, p.data.wrapped);
      return json(200, { ok: true });
    }
    await d.server.wipe(uid);
    await d.deleteUser?.(req);
    return json(200, { ok: true });
  } catch (e) {
    // the reason names a record at most, never a value (outbound.ts)
    if (e instanceof MandatError && e.code === "E_SYNC_PLAINTEXT") return json(422, { error: "plaintext_secret" });
    throw e;
  }
}
