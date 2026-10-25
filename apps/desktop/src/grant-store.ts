import { chmodSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { LOCAL_GRANTS_FILE, LocalGrantsFile } from "@mandat/contract";
import type { LocalGrant } from "@mandat/contract";

// E9g A3 (D-373): where the grants are kept. Only the main process reads and writes this file; the web asks over the
// bridge, the harness and the sandbox never read it. Written atomically (temp file in the same folder, fsync, rename)
// with mode 0600 in a 0700 folder. A file that does not parse means no grants: the safe side, the person grants again.

export function grantsFile(mandatHome: string): string {
  return path.join(mandatHome, LOCAL_GRANTS_FILE);
}

export function loadGrants(file: string): { grants: LocalGrant[]; broken: boolean } {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { grants: [], broken: false };
    return { grants: [], broken: true };
  }
  try {
    const r = LocalGrantsFile.safeParse(JSON.parse(text));
    return r.success ? { grants: r.data.grants, broken: false } : { grants: [], broken: true };
  } catch {
    return { grants: [], broken: true };
  }
}

export function saveGrants(file: string, grants: readonly LocalGrant[]): void {
  const body = LocalGrantsFile.parse({ version: 1, grants });
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = path.join(dir, `.${path.basename(file)}.${randomBytes(6).toString("hex")}.tmp`);
  const fd = openSync(tmp, "wx", 0o600);
  try {
    writeSync(fd, `${JSON.stringify(body, null, 2)}\n`);
    fsyncSync(fd);
  } catch (e) {
    closeSync(fd);
    rmSync(tmp, { force: true });
    throw e;
  }
  closeSync(fd);
  try {
    chmodSync(tmp, 0o600); // the umask cannot widen it, but an odd file system might
    renameSync(tmp, file);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}
