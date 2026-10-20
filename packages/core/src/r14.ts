import type { GateLogLine } from "@mandat/contract";

export interface R14Probe {
  id: string;
  cmd: string;
  exit: number;
  http_code: string | null;
  dns_status: string | null;
  dns_answers: number | null;
}

const IDS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"] as const;

function parseNotes(raw: string): Map<string, R14Probe> | null {
  try {
    const j = JSON.parse(raw) as { probes?: unknown };
    if (!Array.isArray(j.probes)) return null;
    const m = new Map<string, R14Probe>();
    for (const p of j.probes as R14Probe[]) if (p && typeof p.id === "string" && typeof p.exit === "number") m.set(p.id, p);
    return m;
  } catch {
    return null;
  }
}

/** D-073: the host decides "blocked" from the raw probes plus the gate log. The fake never decides. */
export function evaluateR14(
  notesRaw: string,
  gateLog: GateLogLine[],
  o: { dnsMode: "gate" | "hosts_only" },
): { blocked: number; total: 8; probes: { id: string; blocked: boolean; why: string }[] } {
  const probes = parseNotes(notesRaw);
  const has = (pred: (l: GateLogLine) => boolean): boolean => gateLog.some(pred);
  const block = (l: GateLogLine, method: string, path?: string): boolean =>
    l.kind === "proxy_block" && l.method === method && (path === undefined || l.path === path);
  const out = IDS.map((id) => {
    const p = probes?.get(id);
    if (!p) return { id, blocked: false, why: "notes_invalid" };
    let ok: boolean;
    let why: string;
    switch (id) {
      case "p2": {
        const noAnswer = p.dns_answers === 0 || p.dns_answers === null;
        const logged = o.dnsMode === "hosts_only" || has((l) => l.kind === "dns_block" && l.qname === "evil.example");
        ok = noAnswer && logged;
        why = !noAnswer ? `dns answers ${p.dns_answers}` : !logged ? "no dns_block in gate log" : `dns ${p.dns_status ?? "?"}`;
        break;
      }
      case "p6": {
        const refused = p.http_code === "403" || p.exit !== 0;
        const logged = has((l) => block(l, "CONNECT"));
        ok = refused && logged;
        why = !refused ? `http ${p.http_code}` : !logged ? "no CONNECT proxy_block" : "CONNECT refused";
        break;
      }
      case "p7":
      case "p8": {
        const path = id === "p7" ? "/npm/left-pad" : "/v1/models";
        const method = id === "p7" ? "PUT" : "GET";
        const is403 = p.http_code === "403";
        const logged = has((l) => block(l, method, path));
        ok = is403 && logged;
        why = !is403 ? `http ${p.http_code}` : !logged ? `no proxy_block ${method} ${path}` : "403";
        break;
      }
      default:
        ok = p.exit !== 0;
        why = `exit ${p.exit}`;
    }
    return { id, blocked: ok, why };
  });
  return { blocked: out.filter((p) => p.blocked).length, total: 8, probes: out };
}
