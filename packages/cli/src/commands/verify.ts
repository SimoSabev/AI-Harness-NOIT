import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Io } from "../output.js";

// Демо промпт т. 4.1 / D-238: `mandat verify` (GPL) is only an alias that runs `mandat-verify` (Apache-2.0) as a process.
export function mandatVerifyBin(): string {
  return path.join(path.dirname(fileURLToPath(import.meta.resolve("@mandat/verify"))), "main.js");
}

export function verifyAlias(io: Io, args: string[], o: { home?: string; bin?: string } = {}): Promise<number> {
  const argv = [...(o.home && !args.includes("--home") ? ["--home", o.home] : []), ...args];
  return new Promise((resolve) => {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(io.env)) if (v !== undefined && !k.startsWith("SUPABASE_")) env[k] = v; // S35
    const child = spawn(process.execPath, [o.bin ?? mandatVerifyBin(), ...argv], { cwd: io.cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (c: Buffer) => io.stdout(c.toString("utf8")));
    child.stderr.on("data", (c: Buffer) => io.stderr(c.toString("utf8")));
    child.on("error", (e) => {
      io.stderr(`mandat verify: ${e.message}\n`);
      resolve(3);
    });
    child.on("close", (code) => resolve(code ?? 3));
  });
}
