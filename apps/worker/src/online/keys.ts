import { openKey, sealKey } from "@mandat/llm-proxy";
import type { KeyProvider } from "@mandat/llm-proxy";
import type { SqlClient } from "@mandat/ledger";

// E7в / D-313: the sealed keys of an org in private.api_keys (service role). The KEK stays with the worker (MANDAT_KEK
// on a VPS); the database only ever holds ciphertext.
export interface KeyStore {
  put(provider: KeyProvider, value: string): Promise<void>;
  get(provider: KeyProvider): Promise<string | null>;
  delete(provider: KeyProvider): Promise<void>;
  providers(): Promise<string[]>;
}

export function pgKeyStore(db: SqlClient, org: string, kek: Buffer): KeyStore {
  return {
    async put(provider, value) {
      const s = sealKey(value, kek, provider);
      await db.query("select private.store_api_key($1, $2, decode($3, 'base64'), decode($4, 'base64'), $5)", [org, provider, s.ciphertext, s.nonce, s.kek_id]);
    },
    async get(provider) {
      const r = await db.query<{ ciphertext: string; nonce: string; kek_id: string }>(
        "select encode(ciphertext, 'base64') as ciphertext, encode(nonce, 'base64') as nonce, kek_id from private.api_keys where org_id = $1 and provider = $2",
        [org, provider],
      );
      const row = r.rows[0];
      if (!row) return null;
      try {
        return openKey({ ciphertext: row.ciphertext.replace(/\s/g, ""), nonce: row.nonce.replace(/\s/g, ""), kek_id: row.kek_id }, kek, provider);
      } catch {
        return null;
      }
    },
    async delete(provider) {
      await db.query("select private.delete_api_key($1, $2)", [org, provider]);
    },
    async providers() {
      const r = await db.query<{ provider: string }>("select provider from private.api_keys where org_id = $1 order by provider", [org]);
      return r.rows.map((x) => x.provider);
    },
  };
}
