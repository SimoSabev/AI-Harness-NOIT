import { MandatError, SealedSecret, type SyncChange } from "@mandat/contract";
import { createRedactor } from "@mandat/redaction";

// D-494: the last check before anything goes to the sync server (and again on the server). A secret record is
// { label, sealed } and nothing else; every other record is scanned with the redaction rules (prefixes + entropy).
// A hit stops the whole push: better nothing synced than one key in clear.
const redactor = createRedactor({ exactSecrets: [] });
const SECRET_FIELDS = new Set(["label", "sealed", "provider"]);

function check(c: SyncChange): string | null {
  if (c.kind === "secret" && !c.deleted) {
    if (Object.keys(c.body).some((k) => !SECRET_FIELDS.has(k))) return "a secret record holds only label, provider and sealed";
    if (!SealedSecret.safeParse(c.body.sealed).success) return "a secret record must carry a sealed envelope";
    const { sealed: _sealed, ...rest } = c.body;
    return Object.keys(redactor.redactJson(rest).hits).length > 0 ? "plaintext secret in a secret's label" : null;
  }
  return Object.keys(redactor.redactJson(c.body).hits).length > 0 ? "plaintext secret in the record" : null;
}

export function assertSafeOutbound(changes: readonly SyncChange[]): void {
  for (const c of changes) {
    const why = check(c);
    // the message names the record, never the value
    if (why) throw new MandatError("E_SYNC_PLAINTEXT", `${why} (${c.kind}/${c.id}); nothing was sent`, { kind: c.kind, id: c.id });
  }
}
