import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// т. 7 Live: Claude Code calls the server (`claude -p … --allowedTools mcp__mandat__…`). Needs a logged-in `claude` (Simo).
const live = process.env.MANDAT_LIVE_CLAUDE_MCP === "1" && spawnSync("claude", ["--version"]).status === 0;
describe("Claude Code + MCP live", () => {
  // D-276: needs MANDAT_LIVE_CLAUDE_MCP=1, a logged-in `claude` and MANDAT_LIVE_SHOP (a demo-shop copy on fix/discount with .mcp.json)
  it.skipIf(!live)("claude -p вика mandat_verify и mandat_status → FAILED", () => {
    const r = spawnSync("claude", ["-p", "--strict-mcp-config", "--mcp-config", "./.mcp.json", "--allowedTools", "mcp__mandat__mandat_verify,mcp__mandat__mandat_status,mcp__mandat__mandat_explain", "Call mandat_verify and then mandat_status until done; print the result"], { cwd: process.env.MANDAT_LIVE_SHOP, encoding: "utf8", timeout: 900_000 });
    expect(r.stdout).toContain("FAILED");
  });
});
