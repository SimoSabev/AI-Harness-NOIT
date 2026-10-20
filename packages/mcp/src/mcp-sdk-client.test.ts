import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { describe, expect, it } from "vitest";

// т. 7.5 mcp-sdk-client (D-203): the official client as a second check; auto → modern, default → legacy.
const main = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/main.js");
async function connect(opts: Record<string, unknown>) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "mandat-mcp-sdk-"));
  execFileSync("git", ["init", "-q", path.join(tmp, "r")]);
  const transport = new StdioClientTransport({ command: "node", args: [main, "--same-uid", "--allow", path.join(tmp, "r"), "--remote", "file:///nope.git", "--home", path.join(tmp, "h")], env: { PATH: process.env.PATH ?? "" } });
  const client = new Client({ name: "t", version: "1" }, opts as never);
  await client.connect(transport);
  return client;
}

describe("mcp-sdk-client", () => {
  for (const [label, opts, era] of [["auto", { versionNegotiation: { mode: "auto" } }, "modern"], ["default", {}, "legacy"]] as const) {
    it(`${label} → ${era}; callTool mandat_status работи`, async () => {
      const c = await connect(opts);
      expect((c as unknown as { getProtocolEra(): string }).getProtocolEra()).toBe(era);
      const r = (await c.callTool({ name: "mandat_status", arguments: { job_id: "j_01JABCDEFGHJKMNPQRSTVWXYZ0" } })) as { content: { type: string; text: string }[]; isError?: boolean };
      expect(JSON.parse(r.content[0]?.text ?? "{}")).toEqual({ error: "unknown job" });
      await c.close();
    });
  }
});
