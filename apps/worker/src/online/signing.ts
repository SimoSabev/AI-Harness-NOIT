import { execFile } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// E9f (v5 5.6, D-661): the harness's own SSH key for the commits Mandat makes on this computer (local apply: the branch
// mandat/<task>-a<n> and the approved rules). It is made once, outside the sandbox, at $MANDAT_HOME/keys (dir 0700,
// key 0600, no passphrase: the worker signs unattended) — the sandbox can never mount it (only ro files under the run's
// etc/, D-066). git signs with `gpg.format=ssh` + `user.signingKey=<private key path>` (git ≥ 2.34; checked with git
// 2.54.0 on 26.11.2026 without ssh-agent). Verification: `gpg.ssh.allowedSignersFile` = the allowed_signers file next
// to the key. Keyless signing with gitsign/Rekor is M3. The key's content is never read into a log or an error.
export const SIGNING_KEY_FILE = "commit-signing-ed25519";
export const SIGNER = "mandat@localhost";

export interface SigningKey {
  key: string;
  allowedSigners: string;
}

const run = (bin: string, args: string[]) =>
  new Promise<void>((resolve, reject) => execFile(bin, args, { timeout: 20_000, env: { PATH: process.env.PATH ?? "/usr/bin:/bin" } }, (e) => (e ? reject(new Error(`${path.basename(bin)} failed`)) : resolve())));

/** Makes the key on first use; returns the same paths ever after (an existing key is never replaced). */
export async function ensureSigningKey(home: string, o: { keygen?: string } = {}): Promise<SigningKey> {
  const dir = path.join(home, "keys");
  const key = path.join(dir, SIGNING_KEY_FILE);
  const allowedSigners = path.join(dir, "allowed_signers");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  if (!existsSync(key)) await run(o.keygen ?? "ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-C", "mandat-harness", "-f", key]);
  chmodSync(key, 0o600);
  const pub = readFileSync(`${key}.pub`, "utf8").trim().split(/\s+/).slice(0, 2).join(" ");
  const line = `${SIGNER} namespaces="git" ${pub}\n`;
  if (!existsSync(allowedSigners) || readFileSync(allowedSigners, "utf8") !== line) writeFileSync(allowedSigners, line, { mode: 0o644 });
  return { key, allowedSigners };
}

/** The key path for the worker; null when signing is off (MANDAT_SIGN_COMMITS=0) or ssh-keygen is missing (then unsigned, as before). */
export async function commitSigningKey(home: string, env: Record<string, string | undefined>, o: { keygen?: string } = {}): Promise<string | null> {
  if (env.MANDAT_SIGN_COMMITS === "0") return null;
  try {
    return (await ensureSigningKey(home, o)).key;
  } catch {
    return null;
  }
}

/** git `-c` flags that make `commit -S` sign with the key (never the key's content: only its path). */
export function signingConfig(key: string): string[] {
  return ["-c", "gpg.format=ssh", "-c", `user.signingKey=${key}`, "-c", "gpg.ssh.program=ssh-keygen"];
}
