import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { TaskType } from "@mandat/contract";
import type { JobBackend } from "./backend.js";
import { JobId } from "./protocol.js";

// Демо промпт т. 7.1–7.2 (D-212, D-239): three tools; JSON results as text content (works in both protocol eras).
const json = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });
const fail = (msg: string) => ({ content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }], isError: true });

export function createMandatServer(backend: JobBackend): McpServer {
  const server = new McpServer({ name: "mandat", version: "0.1.0" }, { capabilities: { tools: {} } });
  server.registerTool(
    "mandat_verify",
    {
      description: "Start Mandat's verification of the working tree (base pinned by Mandat from the trusted remote). Returns a job id; poll mandat_status.",
      inputSchema: z.object({ repo_path: z.string().min(1).max(4096).optional(), task_type: TaskType.optional() }).strict(),
    },
    async (a) => {
      const r = await backend.verify({ ...(a.repo_path ? { repo_path: a.repo_path } : {}), task_type: a.task_type ?? null });
      return r.ok ? json({ job_id: r.job_id, status: "running", poll_after_s: 5 }) : fail(r.error);
    },
  );
  server.registerTool(
    "mandat_status",
    { description: "Status and verdict of a Mandat verification job.", inputSchema: z.object({ job_id: JobId }).strict() },
    async (a) => {
      const s = await backend.status(a.job_id);
      return "error" in s && !("job_id" in s) ? fail(s.error ?? "error") : json(s);
    },
  );
  server.registerTool(
    "mandat_explain",
    { description: "Plain-language explanation of a finished verdict (deterministic, no LLM).", inputSchema: z.object({ job_id: JobId, lang: z.enum(["bg", "en"]).optional() }).strict() },
    async (a) => {
      const t = await backend.explain(a.job_id, a.lang ?? "en");
      return typeof t === "string" ? json({ text: t }) : fail(t.error);
    },
  );
  return server;
}
