import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { MandatError } from "@mandat/contract";
import type { Renderer } from "./fetcher.js";
import { checkUrl } from "./ssrf.js";

// E9г (D-405): the browser tier — one page per container of the Playwright image (render-runner/render.mjs); the docker
// arguments come from SANDBOX_HARDENING (buildRenderArgs, AGENTS.md rule 7). The URL is checked before the container
// starts; inside, a guard proxy refuses every non-public address the page asks for.

/** the runner script, mounted read-only into the container */
export const RENDER_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "render-runner", "render.mjs");
const Out = z.object({ finalUrl: z.string().max(2000), status: z.number().int().min(0).max(599), html: z.string().max(5 * 1024 * 1024) }).strict();

/** runs `args` with the JSON on stdin and returns stdout and the exit code */
export type RenderRun = (args: string[], stdin: string, timeoutMs: number) => Promise<{ exitCode: number; stdout: string }>;

export function dockerRenderer(o: { run: RenderRun; args: () => string[] | Promise<string[]>; timeoutMs?: number }): Renderer {
  return {
    async render(url) {
      const c = checkUrl(url);
      if (!c.ok) throw new MandatError("E_RESEARCH_SSRF", `refused: ${c.why}`);
      const timeoutMs = o.timeoutMs ?? 20_000;
      const r = await o.run(await o.args(), JSON.stringify({ url, timeoutMs }), timeoutMs + 25_000);
      if (r.exitCode !== 0) throw new MandatError("E_RESEARCH_FETCH", `the browser exited ${r.exitCode}`);
      let j: unknown;
      try {
        j = JSON.parse(r.stdout);
      } catch {
        throw new MandatError("E_RESEARCH_FETCH", "the browser gave no JSON");
      }
      const p = Out.safeParse(j);
      if (!p.success) throw new MandatError("E_RESEARCH_FETCH", "the browser's answer does not match");
      const fin = checkUrl(p.data.finalUrl);
      return { finalUrl: fin.ok ? p.data.finalUrl : url, status: p.data.status, html: p.data.html };
    },
  };
}
