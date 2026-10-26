// E9г (D-394): the browser tier of the fetch ladder. Runs inside the Playwright image (docker/sandbox-ui), one page per
// container. Chromium reaches the web only through a guard proxy in this process, which resolves every host itself and
// refuses loopback, private, link-local and other non-public addresses (so a page cannot make the browser call into the
// host's network); WebRTC is limited to the proxy; images, fonts and media are not loaded; no cookies survive (a fresh
// context). Nothing here tries to pass a bot wall or a CAPTCHA: the page is read as a normal browser shows it.
// stdin: {"url": "...", "timeoutMs": 20000}  →  stdout: {"finalUrl": "...", "status": 200, "html": "..."}
import { lookup } from "node:dns/promises";
import http from "node:http";
import net from "node:net";

const V4_BLOCK = [[0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4]];
const v4int = (ip) => ip.split(".").reduce((a, p) => (a << 8) + Number(p), 0) >>> 0;
const v4ok = (ip) => !V4_BLOCK.some(([n, b]) => (v4int(ip) & ((~0 << (32 - b)) >>> 0)) >>> 0 === n);
/** the same rules as packages/research/src/fetch/ssrf.ts, kept small: v6 is allowed only for global unicast 2000::/3 */
export function publicAddress(ip) {
  const v = net.isIP(ip);
  if (v === 4) return v4ok(ip);
  if (v === 6) {
    const s = ip.toLowerCase();
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    if (m) return v4ok(m[1]);
    const first = parseInt(s.split(":")[0] || "0", 16);
    return (first & 0xe000) === 0x2000 && !s.startsWith("2001:db8") && !s.startsWith("2002:");
  }
  return false;
}
const PORTS = new Set([80, 443, 8080, 8443]);

async function resolvePublic(host) {
  if (net.isIP(host)) return publicAddress(host) ? host : null;
  if (!host.includes(".") || /\.(local|localhost|internal|lan|home|corp|intranet|arpa)$/i.test(host)) return null;
  const all = await lookup(host, { all: true, verbatim: true });
  const ok = all.find((a) => publicAddress(a.address));
  return ok && all.every((a) => publicAddress(a.address)) ? ok.address : null;
}

/** an HTTP proxy (CONNECT for https, absolute-form GET for http) that only reaches public addresses */
export function startGuardProxy() {
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url ?? "");
      const port = Number(u.port || 80);
      const ip = u.protocol === "http:" && PORTS.has(port) ? await resolvePublic(u.hostname) : null;
      if (!ip) {
        res.writeHead(403).end();
        return;
      }
      const up = http.request({ host: ip, port, method: req.method, path: `${u.pathname}${u.search}`, headers: { ...req.headers, host: u.host } }, (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      });
      up.on("error", () => res.destroy());
      req.pipe(up);
    } catch {
      res.writeHead(400).end();
    }
  });
  server.on("connect", async (req, sock, head) => {
    const m = /^([^:]+|\[[^\]]+\]):(\d+)$/.exec(req.url ?? "");
    const host = m?.[1]?.replace(/^\[|\]$/g, "");
    const port = Number(m?.[2]);
    const ip = host && PORTS.has(port) ? await resolvePublic(host).catch(() => null) : null;
    if (!ip) {
      sock.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const up = net.connect(port, ip, () => {
      sock.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) up.write(head);
      up.pipe(sock);
      sock.pipe(up);
    });
    up.on("error", () => sock.destroy());
    sock.on("error", () => up.destroy());
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 MandatResearch/0.1";
const MAX_HTML = 5 * 1024 * 1024;

async function main() {
  let input = "";
  for await (const c of process.stdin) input += c;
  const { url, timeoutMs = 20_000 } = JSON.parse(input);
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("only http(s)");
  const proxy = await startGuardProxy();
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    proxy: { server: `http://127.0.0.1:${proxy.address().port}` },
    args: ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp", "--webrtc-ip-handling-policy=disable_non_proxied_udp", "--disable-features=WebRtcHideLocalIpsWithMdns", "--no-first-run"],
  });
  try {
    const ctx = await browser.newContext({ userAgent: UA, javaScriptEnabled: true, acceptDownloads: false, serviceWorkers: "block", locale: "en-US" });
    await ctx.route("**/*", (r) => (["image", "font", "media"].includes(r.request().resourceType()) ? r.abort() : r.continue()));
    const page = await ctx.newPage();
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    // let the app render: wait until the text stops growing (≤ 6 s), then scroll once for lazy content
    let last = -1;
    for (let i = 0; i < 12; i++) {
      const n = await page.evaluate(() => document.body?.innerText.length ?? 0).catch(() => 0);
      if (n > 300 && n === last) break;
      last = n;
      await page.waitForTimeout(500);
    }
    await page.evaluate(() => window.scrollTo(0, document.body?.scrollHeight ?? 0)).catch(() => undefined);
    await page.waitForTimeout(400);
    const html = (await page.content()).slice(0, MAX_HTML);
    process.stdout.write(JSON.stringify({ finalUrl: page.url(), status: resp?.status() ?? 0, html }));
  } finally {
    await browser.close();
    proxy.close();
  }
}

if (process.env.MANDAT_RENDER_MAIN === "1") {
  main().catch((e) => {
    process.stderr.write(`render failed: ${String(e?.message ?? e).slice(0, 200)}\n`);
    process.exit(2);
  });
}
