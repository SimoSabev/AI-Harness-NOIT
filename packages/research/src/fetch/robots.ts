// E9г (D-394): robots.txt (RFC 9309). The group of the most specific matching user agent (ours, else "*"); the
// longest matching rule wins, Allow wins a tie; "*" and "$" in paths. A robots.txt that cannot be read (4xx) allows
// everything; a server error (5xx) disallows everything (RFC 9309 2.3.1.3–2.3.1.4).

interface Rule {
  allow: boolean;
  path: string;
}
export interface Robots {
  allowed(pathAndQuery: string): boolean;
  crawlDelay: number | null;
}

export function parseRobots(text: string, agent: string): Robots {
  const groups: { agents: string[]; rules: Rule[]; delay: number | null }[] = [];
  let cur: { agents: string[]; rules: Rule[]; delay: number | null } | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = (m[1] ?? "").toLowerCase();
    const val = (m[2] ?? "").trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [], delay: null }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "allow" || key === "disallow") {
      if (val !== "") cur.rules.push({ allow: key === "allow", path: val });
    } else if (key === "crawl-delay" && Number.isFinite(Number(val))) cur.delay = Number(val);
  }
  const me = agent.toLowerCase();
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && me.includes(a)));
  const chosen = mine.length > 0 ? mine : groups.filter((g) => g.agents.includes("*"));
  const rules = chosen.flatMap((g) => g.rules);
  const delay = chosen.map((g) => g.delay).find((d) => d !== null) ?? null;
  return {
    crawlDelay: delay,
    allowed(p: string) {
      let best: Rule | null = null;
      for (const r of rules) {
        if (!matches(r.path, p)) continue;
        if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r;
      }
      return best === null || best.allow;
    },
  };
}
function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern).split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
}
export const ALLOW_ALL: Robots = { allowed: () => true, crawlDelay: null };
export const DISALLOW_ALL: Robots = { allowed: () => false, crawlDelay: null };
