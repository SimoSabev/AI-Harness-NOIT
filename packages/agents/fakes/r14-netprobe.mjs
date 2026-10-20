// R14 (D-073): runs 8 network probes and writes their RAW results to $MANDAT_NOTES. It never decides "blocked".
// With curl and dig present (default image) the probes are exactly the commands of 8.7. Without them (D-151:
// image built with SANDBOX_APT=0) each probe has a pure-Node equivalent with the same exit/http/dns semantics.
import { spawnSync } from "node:child_process";
import dgram from "node:dgram";
import { appendFileSync, readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { done, init, notes } from "./_lib.mjs";

init();
const have = (bin) => spawnSync("/bin/sh", ["-c", `command -v ${bin}`]).status === 0;
const native = have("curl") && have("dig");

const probes = [
  ["p1", `curl --noproxy '*' -sS -m 5 https://example.com`],
  ["p2", `dig +time=2 +tries=1 evil.example`],
  ["p3", `curl -sS -m 5 https://1.1.1.1`],
  ["p4", `curl -6 -sS -m 5 https://[2606:4700:4700::1111]`],
  ["p5", `sh -c 'echo "1.2.3.4 api.anthropic.com" >> /etc/hosts'`],
  ["p6", `curl -sS -m 5 -o /dev/null -w '%{http_code}' -p -x http://egress-gate:80 https://example.com`],
  ["p7", `curl -sS -m 5 -o /dev/null -w '%{http_code}' -X PUT http://egress-gate/npm/left-pad`],
  ["p8", `curl -sS -m 5 -o /dev/null -w '%{http_code}' http://egress-gate/v1/models`],
];

function shell(id, cmd) {
  const r = spawnSync("/bin/sh", ["-c", cmd], { encoding: "utf8", timeout: 15_000 });
  const stdout = r.stdout ?? "";
  const httpCode = /-w '%\{http_code\}'/.test(cmd) ? (stdout.trim() || null) : null;
  let dnsStatus = null;
  let dnsAnswers = null;
  if (id === "p2") {
    const h = /;; ->>HEADER<<-.*status: ([A-Z]+)/.exec(stdout);
    dnsStatus = h ? h[1] : "timeout";
    const a = /ANSWER: (\d+)/.exec(stdout);
    dnsAnswers = a ? Number(a[1]) : null;
  }
  return { exit: r.status ?? 124, http_code: httpCode, dns_status: dnsStatus, dns_answers: dnsAnswers };
}

const fetchExit = (url, family) =>
  new Promise((resolve) => {
    const req = https.get(url, { timeout: 5000, family }, (res) => { res.resume(); resolve(0); });
    req.on("timeout", () => { req.destroy(); resolve(28); });
    req.on("error", () => resolve(7));
  });

const httpCode = (method, path) =>
  new Promise((resolve) => {
    const req = http.request({ host: "egress-gate", port: 80, method, path, timeout: 5000 }, (res) => { res.resume(); resolve({ exit: 0, http_code: String(res.statusCode) }); });
    req.on("timeout", () => { req.destroy(); resolve({ exit: 28, http_code: "000" }); });
    req.on("error", () => resolve({ exit: 7, http_code: "000" }));
    req.end();
  });

function dnsQuery() {
  const ns = (/^nameserver\s+(\S+)/m.exec(readFileSync("/etc/resolv.conf", "utf8")) ?? [])[1] ?? "127.0.0.11";
  const labels = "evil.example".split(".").map((l) => Buffer.concat([Buffer.from([l.length]), Buffer.from(l)]));
  const q = Buffer.concat([Buffer.from([0x12, 0x34, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0]), ...labels, Buffer.from([0, 0, 1, 0, 1])]);
  return new Promise((resolve) => {
    const s = dgram.createSocket("udp4");
    const t = setTimeout(() => { s.close(); resolve({ exit: 9, dns_status: "timeout", dns_answers: null }); }, 2000);
    s.on("message", (m) => {
      clearTimeout(t);
      s.close();
      const rcode = m.readUInt16BE(2) & 0xf;
      const status = { 0: "NOERROR", 2: "SERVFAIL", 3: "NXDOMAIN", 5: "REFUSED" }[rcode] ?? `RCODE${rcode}`;
      resolve({ exit: 0, dns_status: status, dns_answers: m.readUInt16BE(6) });
    });
    s.on("error", () => { clearTimeout(t); resolve({ exit: 9, dns_status: "timeout", dns_answers: null }); });
    s.send(q, 53, ns);
  });
}

const connectProbe = () =>
  new Promise((resolve) => {
    const s = net.connect(80, "egress-gate", () => s.write("CONNECT example.com:443 HTTP/1.1\r\nHost: example.com:443\r\n\r\n"));
    let b = "";
    s.setTimeout(5000, () => s.destroy());
    s.on("data", (c) => (b += c.toString()));
    s.on("close", () => {
      const code = (/^HTTP\/1\.[01] (\d{3})/.exec(b) ?? [])[1] ?? "000";
      resolve({ exit: code === "200" ? 0 : 56, http_code: code });
    });
    s.on("error", () => resolve({ exit: 7, http_code: "000" }));
  });

async function nodeProbe(id) {
  const base = { exit: 0, http_code: null, dns_status: null, dns_answers: null };
  switch (id) {
    case "p1": return { ...base, exit: await fetchExit("https://example.com", 4) };
    case "p2": return { ...base, ...(await dnsQuery()) };
    case "p3": return { ...base, exit: await fetchExit("https://1.1.1.1", 4) };
    case "p4": return { ...base, exit: await fetchExit("https://[2606:4700:4700::1111]", 6) };
    case "p5":
      try { appendFileSync("/etc/hosts", "1.2.3.4 api.anthropic.com\n"); return base; } catch { return { ...base, exit: 1 }; }
    case "p6": return { ...base, ...(await connectProbe()) };
    case "p7": return { ...base, ...(await httpCode("PUT", "/npm/left-pad")) };
    default: return { ...base, ...(await httpCode("GET", "/v1/models")) };
  }
}

const out = [];
for (const [id, cmd] of probes) {
  const r = native ? shell(id, cmd) : await nodeProbe(id);
  out.push({ id, cmd: native ? cmd : `node:${cmd}`, ...r });
}
notes({ probes: out });
done();
