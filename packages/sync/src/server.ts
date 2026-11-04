import { SyncChange, type SyncPullResult, type SyncPushResult, type SyncRecord, type WrappedVaultKey } from "@mandat/contract";
import { assertSafeOutbound } from "./outbound.js";

// D-491: the sync server's rules, apart from storage. Every call is scoped to one person (the uid comes from the
// verified session, never from the body). A revision is a per-person counter: pull(since) returns everything newer;
// push stores a change only if its baseRev is the server's current revision (compare-and-set), else it returns the
// server's copy as a conflict. The server checks again that no key arrives in clear (D-494).

export interface SyncStore {
  since(uid: string, rev: number): Promise<SyncRecord[]>;
  get(uid: string, kind: string, id: string): Promise<SyncRecord | null>;
  /** store if the current revision is `expected` (0 = absent); returns the new revision or null when it moved on */
  putIf(uid: string, change: SyncChange, expected: number): Promise<number | null>;
  wipe(uid: string): Promise<void>;
  getVault(uid: string): Promise<WrappedVaultKey | null>;
  putVault(uid: string, w: WrappedVaultKey): Promise<void>;
}

export interface SyncServer {
  pull(uid: string, since: number): Promise<SyncPullResult>;
  push(uid: string, changes: readonly SyncChange[]): Promise<SyncPushResult>;
  wipe(uid: string): Promise<void>;
  getVault(uid: string): Promise<WrappedVaultKey | null>;
  putVault(uid: string, w: WrappedVaultKey): Promise<void>;
}

export function createSyncServer(store: SyncStore): SyncServer {
  return {
    pull: async (uid, since) => {
      const records = await store.since(uid, since);
      return { records, cursor: records.reduce((m, r) => Math.max(m, r.rev), since) };
    },
    push: async (uid, changes) => {
      const valid = changes.map((c) => SyncChange.parse(c));
      assertSafeOutbound(valid);
      const out: SyncPushResult = { accepted: [], conflicts: [] };
      for (const c of valid) {
        const rev = await store.putIf(uid, c, c.baseRev);
        if (rev !== null) out.accepted.push({ kind: c.kind, id: c.id, rev });
        else {
          const cur = await store.get(uid, c.kind, c.id);
          if (cur) out.conflicts.push(cur);
        }
      }
      return out;
    },
    wipe: (uid) => store.wipe(uid),
    getVault: (uid) => store.getVault(uid),
    putVault: (uid, w) => store.putVault(uid, w),
  };
}

/** In-memory store (tests, and the reference for the Postgres one in apps/web). */
export function memorySyncStore(now: () => string = () => new Date().toISOString()): SyncStore {
  const rows = new Map<string, Map<string, SyncRecord>>();
  const seq = new Map<string, number>();
  const vaults = new Map<string, WrappedVaultKey>();
  const of = (uid: string): Map<string, SyncRecord> => {
    let m = rows.get(uid);
    if (!m) rows.set(uid, (m = new Map()));
    return m;
  };
  return {
    since: (uid, rev) => Promise.resolve([...of(uid).values()].filter((r) => r.rev > rev).sort((a, b) => a.rev - b.rev)),
    get: (uid, kind, id) => Promise.resolve(of(uid).get(`${kind}/${id}`) ?? null),
    putIf: (uid, c, expected) => {
      const m = of(uid);
      const k = `${c.kind}/${c.id}`;
      if ((m.get(k)?.rev ?? 0) !== expected) return Promise.resolve(null);
      const rev = (seq.get(uid) ?? 0) + 1;
      seq.set(uid, rev);
      m.set(k, { kind: c.kind, id: c.id, rev, updatedAt: now(), deleted: c.deleted, body: c.deleted ? {} : c.body });
      return Promise.resolve(rev);
    },
    wipe: (uid) => {
      rows.delete(uid);
      vaults.delete(uid);
      return Promise.resolve();
    },
    getVault: (uid) => Promise.resolve(vaults.get(uid) ?? null),
    putVault: (uid, w) => {
      vaults.set(uid, w);
      return Promise.resolve();
    },
  };
}
