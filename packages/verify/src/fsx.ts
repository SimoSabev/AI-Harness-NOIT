import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

/** write tmp + rename (D-006). */
export function writeAtomic(file: string, content: string | Buffer): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}
