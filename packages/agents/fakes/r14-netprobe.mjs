// R14 (D-073): runs 8 network probes and writes their RAW results to $MANDAT_NOTES. It never decides "blocked".
import { spawnSync } from "node:child_process";
import { done, init, notes } from "./_lib.mjs";

init();
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
const out = [];
for (const [id, cmd] of probes) {
  const r = spawnSync("/bin/sh", ["-c", cmd], { encoding: "utf8", timeout: 15_000 });
  const stdout = r.stdout ?? "";
  const http = /-w '%\{http_code\}'/.test(cmd) ? (stdout.trim().match(/^\d{3}$/)?.[0] ?? (stdout.trim() || null)) : null;
  let dnsStatus = null;
  let dnsAnswers = null;
  if (id === "p2") {
    const h = /;; ->>HEADER<<-.*status: ([A-Z]+)/.exec(stdout);
    dnsStatus = h ? h[1] : "timeout";
    const a = /ANSWER: (\d+)/.exec(stdout);
    dnsAnswers = a ? Number(a[1]) : null;
  }
  out.push({ id, cmd, exit: r.status ?? 124, http_code: http, dns_status: dnsStatus, dns_answers: dnsAnswers });
}
notes({ probes: out });
done();
