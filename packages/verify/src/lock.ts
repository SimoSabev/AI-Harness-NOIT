import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MandatError } from "@mandat/contract";

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};

/** D-027: one run per MANDAT_HOME; a lock of a dead pid is taken over. */
export function acquireRunLock(home: string): () => void {
  mkdirSync(home, { recursive: true });
  const file = path.join(home, "run.lock");
  if (existsSync(file)) {
    const pid = Number(readFileSync(file, "utf8").trim());
    if (Number.isInteger(pid) && pid > 0 && pid !== process.pid && alive(pid)) {
      throw new MandatError("E_LOCKED", `друг run е активен (pid ${pid})`, { pid });
    }
  }
  writeFileSync(file, String(process.pid));
  return () => rmSync(file, { force: true });
}
