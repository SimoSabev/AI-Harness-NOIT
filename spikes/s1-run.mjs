// S1 (≤ $0.30): --mcp-config + --bare (D-087). The probe container joins the run's internal network directly.
import { execFileSync } from "node:child_process";
import { buildClaudeArgv } from "@mandat/agents";
import { repoRoot, spikeRun } from "./harness.mjs";

execFileSync("docker", ["build", "-q", "-t", "mandat-spike-mcp:local", "-f", "docker/spike-mcp/Dockerfile", ...(process.env.MANDAT_EXTRA_CA_CERTS ? ["--secret", `id=extra_ca,src=${process.env.MANDAT_EXTRA_CA_CERTS}`] : []), "."], { cwd: repoRoot, stdio: "inherit" });
const name = `mandat-spike-mcp-${process.pid}`;
execFileSync("docker", ["run", "-d", "--rm", "--name", name, "--network", "none", "--cap-drop=ALL", "--read-only", "mandat-spike-mcp:local"]);
execFileSync("docker", ["network", "disconnect", "none", name]);
try {
  const mcp = JSON.stringify({ mcpServers: { probe: { type: "http", url: "http://mcp-probe:3000/mcp" } } });
  const argv = buildClaudeArgv({ prompt: "Call the echo tool with text MANDAT-S1 and reply with its output.", model: "claude-sonnet-5-5", budgetUsd: 0.3, appendSystemPromptFile: "/m/in/contract.txt", memory: { enabled: true, mcpConfigPath: "/m/in/mcp.json", toolNames: ["mcp__probe__echo"] }, steering: { enabled: false } });
  const r = await spikeRun({
    seed: "shop", contract: "contracts/fix-discount.json", argv, stdin: "closed", budgetUsd: 0.3, extraIn: { "mcp.json": mcp },
    extraNetworkMember: { container: name, alias: "mcp-probe" },
  });
  const init = r.events.find((e) => e.type === "init");
  const calls = execFileSync("docker", ["logs", name], { encoding: "utf8" });
  console.log(JSON.stringify({
    mcp_servers: init?.mcpServers ?? null,
    tool_use: r.events.filter((e) => e.type === "tool_use").map((e) => e.name),
    reply_has_MANDAT_S1: r.events.some((e) => e.type === "assistant_text" && e.text.includes("MANDAT-S1")),
    server_saw_tools_call: calls.includes('"tools/call"'),
    usage: r.usage, runDir: r.runDir,
  }, null, 2));
} finally {
  execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
}
