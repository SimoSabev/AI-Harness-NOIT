import { z } from "zod";

// D-490…D-499: the optional account. Without one nothing leaves this computer. With one, a sync server (Better Auth +
// Postgres) keeps the person's records so the next device gets them. The server is the source of truth; every device
// keeps a local cache. A record is one row of one kind; its body is a JSON object. Secrets (API keys) travel only as a
// SealedSecret — sealed on the device with the person's own vault key, which the server never sees.

export const SyncKind = z.enum(["settings", "prefs", "connection", "secret", "mcp", "skill", "project", "task"]);
export type SyncKind = z.infer<typeof SyncKind>;

export const SyncId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
export type SyncId = z.infer<typeof SyncId>;

const B64 = z.string().regex(/^[A-Za-z0-9_-]+$/).max(16_384);

/** AES-256-GCM under the person's vault key; aad = `${kind}/${id}` so a sealed value cannot be moved to another record. */
export const SealedSecret = z.object({
  v: z.literal(1),
  alg: z.literal("A256GCM"),
  kid: z.string().regex(/^[a-f0-9]{16}$/),
  iv: B64,
  ct: B64,
  tag: B64,
}).strict();
export type SealedSecret = z.infer<typeof SealedSecret>;

/** The vault key wrapped by the person's sync passphrase (scrypt → AES-256-GCM). Stored on the server; useless without the passphrase. */
export const WrappedVaultKey = z.object({
  v: z.literal(1),
  kdf: z.literal("scrypt"),
  n: z.number().int().min(1024).max(1_048_576),
  r: z.number().int().min(1).max(32),
  p: z.number().int().min(1).max(16),
  salt: B64,
  kid: z.string().regex(/^[a-f0-9]{16}$/),
  iv: B64,
  ct: B64,
  tag: B64,
}).strict();
export type WrappedVaultKey = z.infer<typeof WrappedVaultKey>;

export const SyncBody = z.record(z.string(), z.unknown());
export type SyncBody = z.infer<typeof SyncBody>;

export const SyncRecord = z.object({
  kind: SyncKind,
  id: SyncId,
  /** the server's revision; 0 = never stored on the server */
  rev: z.number().int().min(0),
  updatedAt: z.iso.datetime(),
  deleted: z.boolean(),
  body: SyncBody,
}).strict();
export type SyncRecord = z.infer<typeof SyncRecord>;

/** One local change: `baseRev` is the server revision this device last saw (optimistic concurrency). */
export const SyncChange = z.object({
  kind: SyncKind,
  id: SyncId,
  baseRev: z.number().int().min(0),
  deleted: z.boolean(),
  body: SyncBody,
}).strict();
export type SyncChange = z.infer<typeof SyncChange>;

export const SyncPushRequest = z.object({ changes: z.array(SyncChange).max(500) }).strict();
export type SyncPushRequest = z.infer<typeof SyncPushRequest>;

export const SyncPushResult = z.object({
  /** stored, with the new revision */
  accepted: z.array(z.object({ kind: SyncKind, id: SyncId, rev: z.number().int() })),
  /** the server moved on since baseRev: here is its copy; the device merges and pushes again */
  conflicts: z.array(SyncRecord),
});
export type SyncPushResult = z.infer<typeof SyncPushResult>;

export const SyncPullResult = z.object({ records: z.array(SyncRecord), cursor: z.number().int().min(0) });
export type SyncPullResult = z.infer<typeof SyncPullResult>;

/** What the settings page shows about the account (never a token). */
export const AccountStatus = z.discriminatedUnion("state", [
  z.object({ state: z.literal("off") }),
  z.object({ state: z.literal("unconfigured") }),
  z.object({ state: z.literal("pending"), userCode: z.string(), verificationUrl: z.url(), expiresAt: z.iso.datetime() }),
  z.object({
    state: z.literal("signed_in"),
    email: z.string(),
    server: z.url(),
    lastSync: z.iso.datetime().nullable(),
    vault: z.enum(["none", "locked", "open"]),
  }),
]);
export type AccountStatus = z.infer<typeof AccountStatus>;

export const AccountDevice = z.object({ id: z.string(), label: z.string(), lastSeen: z.iso.datetime(), current: z.boolean() });
export type AccountDevice = z.infer<typeof AccountDevice>;
