import { MandatError, SyncBody } from "@mandat/contract";
import { z } from "zod";
import { checkCsrf, checkOrigin, cookieValue, readJsonBody, RateLimiter } from "../guard";
import { prefCookie } from "../../prefs";
import type { Sql } from "../sql";
import { accountStatus, listDevices, pollSignIn, signOut, startSignIn, syncNow, unlockVault, wipeAccount, type DeviceDeps } from "./device";
import { collectLocal } from "./local-store";

// D-497: the device's own API for the optional account — GET /api/account/{status,devices},
// POST /api/account/{start,poll,vault,sync,signout,signout-all,wipe}. Only in `pnpm local` (the person at this computer);
// every POST checks Origin + the CSRF double submit; sign-in steps and the passphrase are rate limited. The answers
// carry a state, never the session token or the vault key.
export const ACCOUNT_GET = ["status", "devices"] as const;
export const ACCOUNT_POST = ["start", "poll", "vault", "sync", "signout", "signout-all", "wipe"] as const;

export interface AccountApiDeps {
  local: boolean;
  user: (req: Request) => Promise<string | null>;
  device: () => DeviceDeps;
  /** the local database, to collect this machine's projects and tasks before a sync (absent: prefs only) */
  db?: Sql;
  limiter: RateLimiter;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
const LIMITED = new Set(["start", "poll", "vault", "wipe"]);
const VaultBody = z.object({ passphrase: z.string().min(10).max(1024) }).strict();
const WipeBody = z.object({ confirm: z.literal("delete") }).strict();

function failure(e: unknown): Response {
  if (e instanceof MandatError) {
    if (e.code === "E_SYNC_VAULT") return json(400, { error: "vault" });
    if (e.code === "E_SYNC_PLAINTEXT") return json(422, { error: "plaintext_secret" });
    if (e.code === "E_SYNC_OFF") return json(409, { error: "sync_off" });
  }
  if (e instanceof z.ZodError) return json(502, { error: "sync_bad_reply" });
  if (e instanceof TypeError) return json(502, { error: "sync_unreachable" }); // fetch failed
  throw e;
}

/** After a sync: the language/theme that came from another device become this browser's cookies. */
async function prefsCookies(d: DeviceDeps): Promise<string[]> {
  const ui = (await d.cache.all()).find((e) => e.kind === "prefs" && e.id === "ui");
  const body = SyncBody.safeParse(ui?.body);
  if (!body.success) return [];
  const out: string[] = [];
  if (body.data.lang === "bg" || body.data.lang === "en") out.push(prefCookie("lang", body.data.lang));
  if (body.data.theme === "light" || body.data.theme === "dark" || body.data.theme === "system") out.push(prefCookie("theme", body.data.theme));
  return out;
}

export async function handleAccount(op: string, req: Request, d: AccountApiDeps): Promise<Response> {
  if (!d.local) return json(404, { error: "local_only" });
  if (!(await d.user(req))) return json(401, { error: "not_signed_in" });
  const dev = d.device();
  try {
    if (req.method === "GET") {
      if (op === "status") return json(200, await accountStatus(dev));
      if (op === "devices") return json(200, { devices: await listDevices(dev) });
      return json(404, { error: "not_found" });
    }
    if (req.method !== "POST" || !(ACCOUNT_POST as readonly string[]).includes(op)) return json(404, { error: "not_found" });
    if (!checkOrigin(req)) return json(403, { error: "bad_origin" });
    if (!checkCsrf(req)) return json(403, { error: "bad_csrf" });
    if (LIMITED.has(op) && !d.limiter.take(op)) return json(429, { error: "rate_limited" });
    const b = await readJsonBody(req);
    if (!b.ok) return json(b.status, { error: "bad_json" });
    switch (op) {
      case "start":
        return json(200, await startSignIn(dev));
      case "poll":
        return json(200, await pollSignIn(dev));
      case "vault": {
        const p = VaultBody.safeParse(b.value);
        if (!p.success) return json(400, { error: "passphrase" });
        await unlockVault(dev, p.data.passphrase);
        return json(200, await accountStatus(dev));
      }
      case "sync": {
        if (d.db) await collectLocal(d.db, dev.cache, { lang: cookieValue(req, "lang"), theme: cookieValue(req, "theme") });
        const pass = await syncNow(dev);
        const cookies = pass.state === "ok" ? await prefsCookies(dev) : [];
        const res = json(200, pass);
        for (const c of cookies) res.headers.append("set-cookie", c);
        return res;
      }
      case "signout":
      case "signout-all":
        await signOut(dev, op === "signout-all");
        return json(200, await accountStatus(dev));
      default: {
        if (!WipeBody.safeParse(b.value).success) return json(400, { error: "confirm" });
        await wipeAccount(dev);
        return json(200, await accountStatus(dev));
      }
    }
  } catch (e) {
    return failure(e);
  }
}
