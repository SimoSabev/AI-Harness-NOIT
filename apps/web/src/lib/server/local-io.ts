import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import type { LocalIo } from "@mandat/mcp-bridge/import";

// D-485: read-only access to the person's own client configs (only the files discoverLocal asks for), bounded in size.
const MAX_FILE = 2 * 1024 * 1024;

export function localIo(home: string = homedir()): LocalIo {
  return {
    home,
    read: async (file) => {
      const s = await stat(file).catch(() => null);
      if (!s?.isFile() || s.size > MAX_FILE) return null;
      return readFile(file, "utf8");
    },
    list: async (dir) => (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).map((e) => e.name),
  };
}
