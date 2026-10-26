import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UA, httpGet } from "./http.js";

let port = 0;
const server = createServer((req, res) => {
  if (req.url === "/page") {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.setHeader("content-encoding", "gzip");
    res.end(gzipSync(`<html><body>ua=${req.headers["user-agent"]}</body></html>`));
  } else if (req.url === "/hop") {
    res.statusCode = 302;
    res.setHeader("location", "/page");
    res.end();
  } else if (req.url === "/to-meta") {
    res.statusCode = 301;
    res.setHeader("location", "http://169.254.169.254/latest/meta-data");
    res.end();
  } else if (req.url === "/loop") {
    res.statusCode = 302;
    res.setHeader("location", "/loop");
    res.end();
  } else if (req.url === "/big") {
    res.end("x".repeat(100_000));
  } else if (req.url === "/slow") {
    setTimeout(() => res.end("late"), 2_000);
  }
});
beforeAll(() => new Promise<void>((r) => server.listen(0, "127.0.0.1", () => ((port = (server.address() as AddressInfo).port), r()))));
afterAll(() => new Promise<void>((r) => server.close(() => r())));

// a public-looking name that the test resolver maps to the loopback test server
const loopbackAs = (host: string) => async (h: string) => (h === host ? [{ address: "127.0.0.1", family: 4 }] : []);

describe("httpGet (AC-13.6)", () => {
  it("a name that resolves to a private address is refused even though the URL looks public", async () => {
    await expect(httpGet(`http://looks-public.example:8080/page`, { resolve: loopbackAs("looks-public.example") })).rejects.toThrow(/private address/);
  });
  it("reads, follows a redirect, decompresses, says who it is", async () => {
    const r = await httpGet(`http://127.0.0.1:${port}/hop`, { loopbackForTests: true });
    expect(r.status).toBe(200);
    expect(r.finalUrl).toBe(`http://127.0.0.1:${port}/page`);
    expect(r.body.toString()).toContain(`ua=${UA}`);
  });
  it("a redirect to a private address is checked again and refused", async () => {
    // the test server is on loopback (allowed for the test), the metadata address is never allowed by the URL check
    await expect(httpGet(`http://127.0.0.1:${port}/to-meta`, { loopbackForTests: true })).rejects.toThrow(/private address/);
  });
  it("redirect loop, size cap, timeout", async () => {
    await expect(httpGet(`http://127.0.0.1:${port}/loop`, { loopbackForTests: true })).rejects.toThrow(/too many redirects/);
    const big = await httpGet(`http://127.0.0.1:${port}/big`, { loopbackForTests: true, maxBytes: 1000 });
    expect(big.truncated).toBe(true);
    expect(big.body.length).toBe(1000);
    await expect(httpGet(`http://127.0.0.1:${port}/slow`, { loopbackForTests: true, timeoutMs: 200 })).rejects.toThrow();
  });
});
