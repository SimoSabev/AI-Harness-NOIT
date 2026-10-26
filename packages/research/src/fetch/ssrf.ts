import { isIP } from "node:net";

// E9г (AC-13.6, PRD 6.13 "Сигурност"): reading an arbitrary URL never reaches this machine or a private network.
// Checked on the URL, on every resolved address (the connection is pinned to the checked address, so DNS rebinding
// cannot swap it) and again on every redirect.

const V4_BLOCK: [number, number][] = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24], [0xc0000200, 24],
  [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4],
];
function v4ToInt(ip: string): number {
  return ip.split(".").reduce((a, p) => (a << 8) + Number(p), 0) >>> 0;
}
function v4Public(ip: string): boolean {
  const n = v4ToInt(ip);
  return !V4_BLOCK.some(([net, bits]) => (n & (bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0)) >>> 0 === net);
}
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4?.[1]) {
    const n = v4ToInt(v4[1]);
    s = s.slice(0, -v4[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head = "", tail] = s.split("::");
  const h = head === "" ? [] : head.split(":");
  const t = tail === undefined || tail === "" ? [] : tail.split(":");
  const fill = tail === undefined ? 0 : 8 - h.length - t.length;
  if (fill < 0) return null;
  const parts = [...h, ...Array<string>(fill).fill("0"), ...t].map((x) => parseInt(x, 16));
  return parts.length === 8 && parts.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? parts : null;
}
function v6Public(ip: string): boolean {
  const p = expandV6(ip);
  if (!p) return false;
  const [a = 0, b = 0, , , , f = 0, g = 0, h = 0] = p;
  if (p.slice(0, 6).every((x) => x === 0)) return false; // :: , ::1 and the deprecated v4-compatible block
  if (p.slice(0, 5).every((x) => x === 0) && f === 0xffff) return v4Public(`${g >> 8}.${g & 255}.${h >> 8}.${h & 255}`); // v4-mapped
  if (a === 0x64 && b === 0xff9b) return v4Public(`${g >> 8}.${g & 255}.${h >> 8}.${h & 255}`); // NAT64
  if ((a & 0xfe00) === 0xfc00 || (a & 0xffc0) === 0xfe80 || (a & 0xff00) === 0xff00) return false; // ULA, link-local, multicast
  if (a === 0x2001 && b === 0x0db8) return false; // documentation
  if (a === 0x0100 && p.slice(1, 4).every((x) => x === 0)) return false; // discard-only
  if (a === 0x2002) return v4Public(`${b >> 8}.${b & 255}.${(p[2] ?? 0) >> 8}.${(p[2] ?? 0) & 255}`); // 6to4
  return true;
}
export function isPublicAddress(ip: string): boolean {
  const v = isIP(ip.replace(/^\[|\]$/g, ""));
  if (v === 4) return v4Public(ip);
  if (v === 6) return v6Public(ip);
  return false;
}

const PORTS = new Set(["", "80", "443", "8080", "8443"]);
export type UrlCheck = { ok: true; url: URL } | { ok: false; why: string };
/** the URL itself: http(s), no user:pass, a usual port, not an internal name, not a private literal address */
export function checkUrl(raw: string): UrlCheck {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, why: "not a URL" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, why: "only http(s)" };
  if (u.username !== "" || u.password !== "") return { ok: false, why: "credentials in the URL" };
  if (!PORTS.has(u.port)) return { ok: false, why: `port ${u.port}` };
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host) !== 0) return isPublicAddress(host) ? { ok: true, url: u } : { ok: false, why: "private address" };
  if (!host.includes(".") || /\.(local|localhost|internal|lan|home|corp|intranet|arpa)$/.test(host) || host === "localhost") return { ok: false, why: "internal host name" };
  return { ok: true, url: u };
}
