import { existsSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { buildRenderArgs } from "@mandat/sandbox";
import { RENDER_SCRIPT, dockerRenderer } from "./browser.js";

// E9г (D-394): the browser tier. The container itself is exercised in the live run; here: its arguments, the adapter,
// and the guard proxy of the runner script (it must never reach a non-public address).
describe("the browser tier (D-394)", () => {
  it("the runner script ships with the package; the container runs it with the hardening flags and no secrets", () => {
    expect(existsSync(RENDER_SCRIPT)).toBe(true);
    const a = buildRenderArgs({ image: "mandat-sandbox-ui:pw1", script: RENDER_SCRIPT, runId: "q_abc" });
    expect(a).toEqual(expect.arrayContaining(["--cap-drop=ALL", "--read-only", "--network", "mandat-upstream", "--user", "1000:1000", "mandat.run=q_abc", "mandat.role=render"]));
    expect(a).toContain(`${RENDER_SCRIPT}:/opt/mandat/ui/research-render.mjs:ro`);
    expect(a.join(" ")).not.toMatch(/privileged|docker\.sock|--cap-add|-p |API_KEY|mdt_/);
    expect(() => buildRenderArgs({ image: "-x", script: RENDER_SCRIPT, runId: "q" })).toThrow();
    expect(() => buildRenderArgs({ image: "img", script: "relative.mjs", runId: "q" })).toThrow();
  });
  it("the adapter: checks the URL first, passes the JSON, validates the answer, keeps a private final URL out", async () => {
    let stdin = "";
    const r = dockerRenderer({ args: () => ["run"], run: async (_a, s) => ((stdin = s), { exitCode: 0, stdout: JSON.stringify({ finalUrl: "https://app.example.org/p", status: 200, html: "<html></html>" }) }) });
    expect(await r.render("https://app.example.org/")).toEqual({ finalUrl: "https://app.example.org/p", status: 200, html: "<html></html>" });
    expect(JSON.parse(stdin)).toMatchObject({ url: "https://app.example.org/" });
    await expect(r.render("http://10.0.0.1/")).rejects.toThrow(/refused/);
    const odd = dockerRenderer({ args: () => [], run: async () => ({ exitCode: 0, stdout: JSON.stringify({ finalUrl: "http://127.0.0.1/x", status: 200, html: "" }) }) });
    expect((await odd.render("https://a.example.org/")).finalUrl).toBe("https://a.example.org/");
    await expect(dockerRenderer({ args: () => [], run: async () => ({ exitCode: 2, stdout: "" }) }).render("https://a.example.org/")).rejects.toThrow(/exited 2/);
    await expect(dockerRenderer({ args: () => [], run: async () => ({ exitCode: 0, stdout: "{}" }) }).render("https://a.example.org/")).rejects.toThrow(/does not match/);
  });
  it("the guard proxy refuses CONNECT and plain requests to loopback and private addresses", async () => {
    const mod = (await import(RENDER_SCRIPT)) as { publicAddress: (ip: string) => boolean; startGuardProxy: () => Promise<http.Server> };
    for (const ip of ["127.0.0.1", "10.0.0.1", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) expect(mod.publicAddress(ip)).toBe(false);
    for (const ip of ["8.8.8.8", "2606:4700:4700::1111"]) expect(mod.publicAddress(ip)).toBe(true);
    const proxy = await mod.startGuardProxy();
    const port = (proxy.address() as AddressInfo).port;
    const connect = (target: string) =>
      new Promise<number>((ok) => {
        const req = http.request({ host: "127.0.0.1", port, method: "CONNECT", path: target });
        req.on("connect", (res, sock) => (sock.destroy(), ok(res.statusCode ?? 0)));
        req.on("error", () => ok(-1));
        req.end();
      });
    expect(await connect("127.0.0.1:443")).toBe(403);
    expect(await connect("169.254.169.254:80")).toBe(403);
    expect(await connect("localhost:443")).toBe(403);
    expect(await connect("example.org:22")).toBe(403);
    const plain = await new Promise<number>((ok) => http.get({ host: "127.0.0.1", port, path: "http://10.1.2.3/x" }, (res) => (res.resume(), ok(res.statusCode ?? 0))).on("error", () => ok(-1)));
    expect(plain).toBe(403);
    proxy.close();
  });
});
