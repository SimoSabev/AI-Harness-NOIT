import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { beforeAll, describe, expect, it } from "vitest";
import { buildRenderArgs, dockerText, realDockerRunner, uiImageTag } from "@mandat/sandbox";
import { RENDER_SCRIPT, dockerRenderer } from "./browser.js";
import { Fetcher } from "./fetcher.js";
import type { Attempt } from "./fetcher.js";
import type { HttpResult } from "./http.js";

// E9г (D-442): the browser tier of the fetch ladder against a local page — the real UI image (Playwright + Chromium),
// the SANDBOX_HARDENING flags, no network at all (fixture mode). HTTP gets only the JS shell, so the ladder goes to the
// browser, which runs the page's script (it fetches /data.json from its own origin) and reads the rendered text.
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../..");
const docker = realDockerRunner();
const image = uiImageTag(repoRoot);
const fx = mkdtempSync(path.join(os.tmpdir(), "mandat-render-fx-"));
const URL0 = "https://app.example.org/guide/";
const SHELL = `<!doctype html><html><head><title>Guide</title></head><body><div id="app">Loading…</div>
<script>fetch("/data.json").then((r) => r.json()).then((d) => { const a = document.createElement("article"); a.innerHTML = "<h1>" + d.title + "</h1>" + d.paras.map((p) => "<p>" + p + "</p>").join(""); document.getElementById("app").replaceWith(a); });</script></body></html>`;
const DATA = { title: "Canonical JSON", paras: Array.from({ length: 12 }, (_v, i) => `Paragraph ${i + 1}: JCS sorts object keys by their UTF-16 code units and writes numbers the way ECMAScript does.`) };

beforeAll(async () => {
  if ((await dockerText(docker, ["image", "inspect", image], 30_000)).exitCode !== 0) throw new Error(`image missing: ${image} (pnpm mandat images build --ui)`);
  // the container user (1000) reads the folder through the VM's share (Colima): mkdtemp's 0700 is not enough
  chmodSync(fx, 0o755);
  mkdirSync(path.join(fx, "app.example.org", "guide"), { recursive: true, mode: 0o755 });
  writeFileSync(path.join(fx, "app.example.org", "guide", "index.html"), SHELL);
  writeFileSync(path.join(fx, "app.example.org", "data.json"), JSON.stringify(DATA));
}, 60_000);

describe("the browser tier in Docker (D-442)", () => {
  it("a JS page: http is thin → the browser renders it → the page text, tier browser", async () => {
    const renderer = dockerRenderer({
      args: () => buildRenderArgs({ image, script: RENDER_SCRIPT, runId: "q_render_test", fixtures: fx }),
      run: async (args, stdin, timeoutMs) => {
        const out: Buffer[] = [];
        const r = await docker.run(args, { env: {}, stdin: Readable.from([stdin]), timeoutMs, onStdout: (c) => out.push(c) });
        return { exitCode: r.timedOut ? 124 : r.exitCode, stdout: Buffer.concat(out).toString("utf8") };
      },
      // Chromium's first start in a busy VM can take a minute; the page itself loads from the folder
      timeoutMs: 90_000,
    });
    const shell = (url: string): HttpResult => ({ url, finalUrl: url, status: 200, contentType: "text/html", body: Buffer.from(SHELL), ms: 1, truncated: false });
    const attempts: Attempt[] = [];
    const f = new Fetcher({ get: async (u) => shell(u), renderer, respectRobots: false, archive: false, politeMs: 0 });
    const page = await f.fetch(URL0, (a) => attempts.push(a));
    expect(attempts.map((a) => `${a.tier}:${a.status}`)).toEqual(["http:thin", "browser:ok"]);
    expect(page?.tier).toBe("browser");
    expect(page?.title).toMatch(/Canonical JSON|Guide/);
    expect(page?.text).toContain("Paragraph 12: JCS sorts object keys by their UTF-16 code units");
    expect(page?.finalUrl).toBe(URL0);
  }, 300_000);
  it("a page that is not in the folder is not served (no network to fall back on): the browser tier fails cleanly", async () => {
    const renderer = dockerRenderer({
      args: () => buildRenderArgs({ image, script: RENDER_SCRIPT, runId: "q_render_test", fixtures: fx }),
      run: async (args, stdin, timeoutMs) => {
        const out: Buffer[] = [];
        const r = await docker.run(args, { env: {}, stdin: Readable.from([stdin]), timeoutMs, onStdout: (c) => out.push(c) });
        return { exitCode: r.timedOut ? 124 : r.exitCode, stdout: Buffer.concat(out).toString("utf8") };
      },
      timeoutMs: 8_000,
    });
    const r = await renderer.render("https://other.example.org/").then((x) => x.status, () => -1);
    expect([-1, 404]).toContain(r);
  }, 120_000);
});
