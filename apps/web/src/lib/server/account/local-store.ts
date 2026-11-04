import { SyncBody, SyncId, SyncKind } from "@mandat/contract";
import { createRedactor } from "@mandat/redaction";
import { sameJson as same, type LocalCache, type LocalEntry } from "@mandat/sync";
import type { Sql } from "../sql";
import type { AccountLink, LinkStore } from "./device";

// D-492: the device's account link and sync cache in the local database (supabase/migrations/…_account_link.sql),
// and the collectors that put this machine's own data into the cache: language/theme, projects, task history.
// Collected text goes through the redaction rules first, so a key pasted into a task never blocks or leaks a sync.

interface LinkRow { server: string; state: "pending" | "signed_in"; device_code: string | null; user_code: string | null; verification_url: string | null; expires_at: Date | string | null; token: string | null; email: string | null; vault_key: string | null; last_sync: Date | string | null }
const iso = (v: Date | string | null): string | null => (v === null ? null : new Date(v).toISOString());

export function pgLinkStore(db: Sql): LinkStore {
  return {
    get: async () => {
      const r = (await db.query<LinkRow>("select server, state, device_code, user_code, verification_url, expires_at, token, email, vault_key, last_sync from private.account_link")).rows[0];
      if (!r) return null;
      const l: AccountLink = { server: r.server, state: r.state, vaultKey: r.vault_key, lastSync: iso(r.last_sync) };
      if (r.device_code) l.deviceCode = r.device_code;
      if (r.user_code) l.userCode = r.user_code;
      if (r.verification_url) l.verificationUrl = r.verification_url;
      if (r.expires_at) l.expiresAt = iso(r.expires_at) as string;
      if (r.token) l.token = r.token;
      if (r.email) l.email = r.email;
      return l;
    },
    set: async (l) => {
      if (!l) {
        await db.query("delete from private.account_link");
        await db.query("update private.account_cache set rev = 0, base = null, dirty = true"); // the next account starts as a first sign-in
        await db.query("delete from private.account_cursor");
        return;
      }
      await db.query(
        `insert into private.account_link (one, server, state, device_code, user_code, verification_url, expires_at, token, email, vault_key, last_sync, updated_at)
         values (true, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         on conflict (one) do update set server = excluded.server, state = excluded.state, device_code = excluded.device_code, user_code = excluded.user_code,
           verification_url = excluded.verification_url, expires_at = excluded.expires_at, token = excluded.token, email = excluded.email,
           vault_key = excluded.vault_key, last_sync = excluded.last_sync, updated_at = now()`,
        [l.server, l.state, l.deviceCode ?? null, l.userCode ?? null, l.verificationUrl ?? null, l.expiresAt ?? null, l.token ?? null, l.email ?? null, l.vaultKey ?? null, l.lastSync ?? null],
      );
    },
  };
}

interface CacheRow { kind: string; id: string; body: unknown; deleted: boolean; rev: string | number; base: unknown; dirty: boolean }

export function pgCache(db: Sql): LocalCache {
  return {
    all: async () =>
      (await db.query<CacheRow>("select kind, id, body, deleted, rev, base, dirty from private.account_cache order by kind, id")).rows.map((r) => ({
        kind: SyncKind.parse(r.kind), id: r.id, body: SyncBody.parse(r.body), deleted: r.deleted, rev: Number(r.rev), base: r.base === null ? null : SyncBody.parse(r.base), dirty: r.dirty,
      })),
    put: async (e: LocalEntry) => {
      await db.query(
        `insert into private.account_cache (kind, id, body, deleted, rev, base, dirty) values ($1, $2, $3::jsonb, $4, $5, $6::jsonb, $7)
         on conflict (kind, id) do update set body = excluded.body, deleted = excluded.deleted, rev = excluded.rev, base = excluded.base, dirty = excluded.dirty`,
        [e.kind, SyncId.parse(e.id), JSON.stringify(e.body), e.deleted, e.rev, e.base === null ? null : JSON.stringify(e.base), e.dirty],
      );
    },
    cursor: async () => Number((await db.query<{ cursor: string }>("select cursor from private.account_cursor")).rows[0]?.cursor ?? 0),
    setCursor: async (n) => {
      await db.query("insert into private.account_cursor (one, cursor) values (true, $1) on conflict (one) do update set cursor = excluded.cursor", [n]);
    },
  };
}

const redactor = createRedactor({ exactSecrets: [] });

/** Puts locally-owned records into the cache: new or changed → dirty; unchanged → left alone. */
export async function collect(cache: LocalCache, items: readonly { kind: SyncKind; id: string; body: SyncBody }[]): Promise<void> {
  const index = new Map((await cache.all()).map((e) => [`${e.kind}/${e.id}`, e]));
  for (const it of items) {
    const clean = redactor.redactJson(it.body).value as SyncBody;
    const cur = index.get(`${it.kind}/${it.id}`);
    if (cur && !cur.deleted && same(cur.body, clean)) continue;
    await cache.put({ kind: it.kind, id: SyncId.parse(it.id), body: clean, deleted: false, rev: cur?.rev ?? 0, base: cur?.base ?? null, dirty: true });
  }
}

export const THEMES = ["light", "dark", "system"] as const;

/** This machine's own data (D-492): language and theme, projects, task history. Other kinds come from their owners. */
export async function collectLocal(db: Sql, cache: LocalCache, prefs: { lang: string | null; theme: string | null }): Promise<void> {
  const ui: SyncBody = {};
  if (prefs.lang === "bg" || prefs.lang === "en") ui.lang = prefs.lang;
  if (prefs.theme && (THEMES as readonly string[]).includes(prefs.theme)) ui.theme = prefs.theme;
  const items: { kind: SyncKind; id: string; body: SyncBody }[] = Object.keys(ui).length > 0 ? [{ kind: "prefs", id: "ui", body: ui }] : [];
  const repos = await db.query<{ id: string; provider: string; full_name: string; remote_url: string; default_branch: string }>(
    "select id::text as id, provider, full_name, remote_url, default_branch from public.repos order by created_at limit 500");
  for (const r of repos.rows) items.push({ kind: "project", id: r.id, body: { provider: r.provider, fullName: r.full_name, remoteUrl: r.remote_url, defaultBranch: r.default_branch } });
  const tasks = await db.query<{ id: string; repo_id: string; type: string; agent: string; text: string; state: string; created_at: Date | string }>(
    "select id, repo_id::text as repo_id, type, agent, text, state, created_at from public.tasks order by created_at desc limit 1000");
  for (const t of tasks.rows) items.push({ kind: "task", id: t.id, body: { project: t.repo_id, type: t.type, agent: t.agent, text: t.text, state: t.state, createdAt: new Date(t.created_at).toISOString() } });
  await collect(cache, items);
}
