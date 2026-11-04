import type { SyncBody, SyncChange, SyncKind, SyncPullResult, SyncPushRequest, SyncPushResult, SyncRecord } from "@mandat/contract";
import { APPEND_ONLY, mergeBodies, type LocalRecord, type RecordConflict } from "./merge.js";
import { assertSafeOutbound } from "./outbound.js";

// D-492: the device side. The local cache is what the app reads; the server is the truth. One pass = pull everything
// newer than the cursor (merging into local edits), then push local edits with the revision they were based on. A
// conflict from the push is merged the same way and pushed again (at most three rounds per pass). Without an account
// the transport is null and the pass does nothing at all — no request leaves the machine (D-490).

export interface LocalEntry extends LocalRecord {
  /** the server revision this entry is based on (0 = never stored there) */
  rev: number;
  /** the body as the server last had it; null before the first sync */
  base: SyncBody | null;
  dirty: boolean;
}

export interface LocalCache {
  all(): Promise<LocalEntry[]>;
  put(e: LocalEntry): Promise<void>;
  cursor(): Promise<number>;
  setCursor(n: number): Promise<void>;
}

export interface SyncTransport {
  pull(since: number): Promise<SyncPullResult>;
  push(req: SyncPushRequest): Promise<SyncPushResult>;
}

export type SyncPass = { state: "off" } | { state: "ok"; pulled: number; pushed: number; conflicts: RecordConflict[] };

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const keyOf = (r: { kind: string; id: string }): string => `${r.kind}/${r.id}`;
const MAX_ROUNDS = 3;

function absorb(l: LocalEntry | undefined, r: SyncRecord, conflicts: RecordConflict[]): LocalEntry {
  const clean: LocalEntry = { kind: r.kind, id: r.id, body: r.body, deleted: r.deleted, rev: r.rev, base: r.body, dirty: false };
  if (!l?.dirty || APPEND_ONLY.has(r.kind)) return clean;
  if (l.deleted && r.deleted) return clean;
  const m = mergeBodies(l.base, l.body, r.body);
  conflicts.push(...m.conflicts.map((c) => ({ kind: r.kind, id: r.id, ...c })));
  const deleted = l.deleted && !r.deleted && same(l.base, r.body); // a local delete holds only if the server did not move on
  const changed = deleted || !same(m.body, r.body) || r.deleted;
  return { ...clean, body: deleted ? l.body : m.body, deleted, dirty: changed && !(r.deleted && same(m.body, r.body)) };
}

export function createSyncEngine(o: { transport: () => Promise<SyncTransport | null>; cache: LocalCache }) {
  const { cache } = o;
  const syncOnce = async (): Promise<SyncPass> => {
    const t = await o.transport();
    if (!t) return { state: "off" };
    const conflicts: RecordConflict[] = [];
    const index = async () => new Map((await cache.all()).map((e) => [keyOf(e), e]));

    const p = await t.pull(await cache.cursor());
    let local = await index();
    for (const r of p.records) await cache.put(absorb(local.get(keyOf(r)), r, conflicts));
    await cache.setCursor(p.cursor);

    let pushed = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const dirty = (await cache.all()).filter((e) => e.dirty);
      if (dirty.length === 0) break;
      const changes: SyncChange[] = dirty.map((e) => ({ kind: e.kind, id: e.id, baseRev: e.rev, deleted: e.deleted, body: e.deleted ? {} : e.body }));
      assertSafeOutbound(changes); // before the network, not after
      const res = await t.push({ changes });
      local = await index();
      const done = new Set<string>();
      for (const a of res.accepted) {
        const e = local.get(keyOf(a));
        if (e) await cache.put({ ...e, rev: a.rev, base: e.deleted ? {} : e.body, dirty: false });
        done.add(keyOf(a));
        pushed++;
      }
      for (const r of res.conflicts) {
        await cache.put(absorb(local.get(keyOf(r)), r, conflicts));
        done.add(keyOf(r));
      }
      // the server lost the record (the person wiped their data): send it again as new
      for (const e of dirty) if (!done.has(keyOf(e))) await cache.put({ ...e, rev: 0, base: null });
    }
    return { state: "ok", pulled: p.records.length, pushed, conflicts };
  };
  return { syncOnce };
}

/** In-memory cache: every initial record is a local edit not yet on the server. */
export function memoryCache(initial: readonly LocalRecord[]): LocalCache & { edit(kind: SyncKind, id: string, body: SyncBody): Promise<void> } {
  const m = new Map<string, LocalEntry>(initial.map((r) => [keyOf(r), { ...r, rev: 0, base: null, dirty: true }]));
  let cursor = 0;
  return {
    all: () => Promise.resolve([...m.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b)))),
    put: (e) => {
      m.set(keyOf(e), e);
      return Promise.resolve();
    },
    cursor: () => Promise.resolve(cursor),
    setCursor: (n) => {
      cursor = n;
      return Promise.resolve();
    },
    edit: (kind, id, body) => {
      const e = m.get(`${kind}/${id}`);
      m.set(`${kind}/${id}`, { kind, id, body, deleted: false, rev: e?.rev ?? 0, base: e?.base ?? null, dirty: true });
      return Promise.resolve();
    },
  };
}
