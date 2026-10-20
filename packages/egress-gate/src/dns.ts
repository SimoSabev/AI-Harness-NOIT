export type DnsAnswer = { kind: "a"; ip: string } | { kind: "nodata" } | { kind: "nxdomain" } | { kind: "servfail" };
export interface DnsQuestion {
  id: number;
  name: string;
  qtype: number;
}

/** Parses a single-question query; anything malformed (or a response) → null and the server stays silent. */
export function parseDnsQuery(b: Buffer): DnsQuestion | null {
  if (b.length < 12) return null;
  const id = b.readUInt16BE(0);
  const flags = b.readUInt16BE(2);
  if (flags & 0x8000) return null; // a response, not a query
  if (b.readUInt16BE(4) < 1) return null;
  let off = 12;
  const labels: string[] = [];
  for (;;) {
    if (off >= b.length) return null;
    const len = b[off] as number;
    if (len === 0) {
      off++;
      break;
    }
    if (len & 0xc0) return null; // no compression in questions
    if (off + 1 + len > b.length) return null;
    labels.push(b.subarray(off + 1, off + 1 + len).toString("latin1"));
    off += 1 + len;
    if (labels.join(".").length > 253) return null;
  }
  if (off + 4 > b.length) return null;
  return { id, name: labels.join("."), qtype: b.readUInt16BE(off) };
}

function encodeName(name: string): Buffer {
  const parts = name.split(".").filter((p) => p.length > 0);
  return Buffer.concat([...parts.map((p) => Buffer.concat([Buffer.from([p.length]), Buffer.from(p, "latin1")])), Buffer.from([0])]);
}

export function buildDnsResponse(q: DnsQuestion, a: DnsAnswer): Buffer {
  const rcode = a.kind === "nxdomain" ? 3 : a.kind === "servfail" ? 2 : 0;
  const header = Buffer.alloc(12);
  header.writeUInt16BE(q.id, 0);
  header.writeUInt16BE(0x8000 | 0x0400 | 0x0100 | rcode, 2); // QR, AA, RD (echo), rcode
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(a.kind === "a" ? 1 : 0, 6);
  const question = Buffer.concat([encodeName(q.name), Buffer.from([q.qtype >> 8, q.qtype & 0xff, 0, 1])]);
  if (a.kind !== "a") return Buffer.concat([header, question]);
  const ip = a.ip.split(".").map((x) => Number.parseInt(x, 10));
  const answer = Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 5, 0, 4, ...ip]);
  return Buffer.concat([header, question, answer]);
}

/** D-045. */
export function decideDns(q: { name: string; qtype: number }, selfIp: string | null): { answer: DnsAnswer; logBlock: boolean } {
  if (selfIp === null) return { answer: { kind: "servfail" }, logBlock: false };
  const name = q.name.toLowerCase().replace(/\.$/, "");
  if (name === "egress-gate") {
    return q.qtype === 1 ? { answer: { kind: "a", ip: selfIp }, logBlock: false } : { answer: { kind: "nodata" }, logBlock: false };
  }
  return { answer: { kind: "nxdomain" }, logBlock: true };
}
