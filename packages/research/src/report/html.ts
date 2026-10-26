import type { ResearchReport, TraceEvent } from "@mandat/contract";
import { processView } from "./process.js";
import type { ProcessView } from "./process.js";
import { duration, langOf, usd, wordsOf } from "./text.js";
import type { Words } from "./text.js";

// E9г (D-408): the report as ONE self-contained HTML file — no network, no scripts: the answer with citations whose
// exact quote shows on hover, the claims with verdicts and their quotes, the sources with hash and fetch tier, the
// process map, the timeline, the models per role with their cost, the full log and the data as JSON. Opens offline,
// prints to PDF. Every string from the web is escaped.

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const VERDICT_TONE = { confirmed: "ok", single: "warn", conflict: "bad", unchecked: "mute", quote_missing: "mute" } as const;

/** a tiny, safe markdown: headings, lists, bold, code, paragraphs; [n] → a citation link with the quote on hover */
export function mdToHtml(md: string, cite: (n: number) => { title: string; ok: boolean }): string {
  const inline = (s: string) =>
    esc(s)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\]/g, (_m, list: string) =>
        list
          .split(",")
          .map((x) => Number(x.trim()))
          .map((n) => {
            const c = cite(n);
            return c.ok ? `<a class="cite" href="#src-${n}" data-q="${esc(c.title)}">${n}</a>` : "";
          })
          .join(""),
      );
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length > 0) out.push(`<p>${para.map(inline).join(" ")}</p>`);
    para = [];
  };
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (h) {
      flush();
      close();
      const lvl = Math.min(6, (h[1] ?? "#").length + 2);
      out.push(`<h${lvl}>${inline(h[2] ?? "")}</h${lvl}>`);
    } else if (ul || ol) {
      flush();
      const want = ul ? "ul" : "ol";
      if (list !== want) {
        close();
        out.push(`<${want}>`);
        list = want;
      }
      out.push(`<li>${inline((ul ?? ol)?.[1] ?? "")}</li>`);
    } else if (line.trim() === "") {
      flush();
      close();
    } else {
      close();
      para.push(line.trim());
    }
  }
  flush();
  close();
  return out.join("\n");
}

const W = 1000;
function processMap(v: ProcessView, r: ResearchReport, w: Words): string {
  const lanes = v.lanes.filter((l) => l.id !== "main");
  const rowH = 92;
  const top = 34;
  const h = Math.max(140, top + lanes.length * rowH + 10);
  const cols = [20, 210, 430, 640, 840];
  const midY = top + (lanes.length * rowH) / 2 - rowH / 2 + 30;
  const parts: string[] = [];
  const heads = [w.title, w.lane, w.stats.queries, w.sources, w.claims];
  heads.forEach((t, i) => parts.push(`<text x="${cols[i]}" y="18" class="mh">${esc(t)}</text>`));
  parts.push(`<rect x="${cols[0]}" y="${midY - 30}" width="170" height="60" rx="10" class="node q"/><foreignObject x="${cols[0]! + 8}" y="${midY - 26}" width="154" height="52"><div xmlns="http://www.w3.org/1999/xhtml" class="fo">${esc(r.request.question.slice(0, 110))}</div></foreignObject>`);
  lanes.forEach((l, i) => {
    const y = top + i * rowH + 10;
    const cy = y + 30;
    const edge = (x1: number, y1: number, x2: number, y2: number) => `<path d="M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}" class="edge"/>`;
    parts.push(edge(cols[0]! + 170, midY, cols[1]!, cy));
    parts.push(`<rect x="${cols[1]}" y="${y}" width="190" height="60" rx="10" class="node"/><foreignObject x="${cols[1]! + 8}" y="${y + 4}" width="174" height="52"><div xmlns="http://www.w3.org/1999/xhtml" class="fo"><b>${esc(l.id)}</b> ${esc(l.title.slice(0, 80))}</div></foreignObject>`);
    parts.push(edge(cols[1]! + 190, cy, cols[2]!, cy));
    const prov = Object.entries(l.providers).map(([p, n]) => `${p} ×${n}`).join(", ");
    parts.push(`<rect x="${cols[2]}" y="${y}" width="190" height="60" rx="10" class="node"/><text x="${cols[2]! + 10}" y="${y + 24}" class="big">${l.queries.length}</text><text x="${cols[2]! + 44}" y="${y + 24}" class="small">${esc(w.stats.queries)} · ${l.results} ${esc(w.stats.results)}</text><text x="${cols[2]! + 10}" y="${y + 46}" class="small">${esc(prov.slice(0, 44))}</text><title>${esc(l.queries.join("\n"))}</title>`);
    parts.push(edge(cols[2]! + 190, cy, cols[3]!, cy));
    const doms = l.domains.slice(0, 4).join(", ") + (l.domains.length > 4 ? ` +${l.domains.length - 4}` : "");
    parts.push(`<rect x="${cols[3]}" y="${y}" width="180" height="60" rx="10" class="node"/><text x="${cols[3]! + 10}" y="${y + 24}" class="big">${l.read}</text><text x="${cols[3]! + 44}" y="${y + 24}" class="small">/ ${l.fetched} · ${l.quotes} ${esc(w.stats.quotes)}</text><text x="${cols[3]! + 10}" y="${y + 46}" class="small">${esc(doms.slice(0, 40))}</text><title>${esc(l.domains.join("\n"))}</title>`);
    parts.push(edge(cols[3]! + 180, cy, cols[4]!, cy));
    const total = Object.values(l.claims).reduce((a, b) => a + b, 0);
    let x = cols[4]! + 10;
    const bar: string[] = [];
    for (const [k, n] of Object.entries(l.claims)) {
      if (n === 0) continue;
      const wpx = Math.max(6, (130 * n) / Math.max(1, total));
      bar.push(`<rect x="${x}" y="${y + 34}" width="${wpx}" height="12" rx="3" class="v-${VERDICT_TONE[k as keyof typeof VERDICT_TONE]}"><title>${esc(w.v[k as keyof Words["v"]])}: ${n}</title></rect>`);
      x += wpx + 2;
    }
    parts.push(`<rect x="${cols[4]}" y="${y}" width="150" height="60" rx="10" class="node"/><text x="${cols[4]! + 10}" y="${y + 24}" class="big">${total}</text><text x="${cols[4]! + 44}" y="${y + 24}" class="small">${esc(w.stats.claims)}</text>${bar.join("")}`);
  });
  return `<svg class="map" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(w.map)}">${parts.join("")}</svg>`;
}

function timelineSvg(v: ProcessView, w: Words): string {
  const rows = [...new Set(["main", ...v.lanes.map((l) => l.id)])];
  const rowH = 34;
  const left = 60;
  const h = 26 + rows.length * rowH;
  const x = (ms: number) => left + ((W - left - 10) * ms) / v.span;
  const off = { model: 4, search: 13, fetch: 22, read: 22 } as const;
  const bars = v.timeline.map((b) => {
    const r = rows.indexOf(b.lane);
    const y = 22 + r * rowH + off[b.kind];
    const x1 = x(b.start);
    return `<rect x="${x1.toFixed(1)}" y="${y}" width="${Math.max(2, x(b.end) - x1).toFixed(1)}" height="7" rx="2" class="t-${b.tone} k-${b.kind}"><title>${esc(b.label.slice(0, 200))} (${duration(b.end - b.start)})</title></rect>`;
  });
  const labels = rows.map((r, i) => `<text x="4" y="${22 + i * rowH + 20}" class="small">${esc(r === "main" ? "—" : r)}</text><line x1="${left}" x2="${W - 10}" y1="${22 + (i + 1) * rowH - 2}" y2="${22 + (i + 1) * rowH - 2}" class="grid"/>`);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => `<text x="${x(v.span * f) - (f === 1 ? 30 : 0)}" y="14" class="small">${duration(v.span * f)}</text>`);
  return `<svg class="tl" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(w.timeline)}">${ticks.join("")}${labels.join("")}${bars.join("")}</svg>
<p class="legend"><span class="sw k-model"></span>${esc(w.models)} <span class="sw k-search"></span>${esc(w.stats.queries)} <span class="sw k-fetch"></span>${esc(w.stats.pages_fetched)}</p>`;
}

const CSS = `:root{--bg:#fbfaf8;--panel:#fff;--ink:#1d1b18;--mute:#6b665e;--line:#e6e1d8;--accent:#b4532a;--ok:#2f7d4f;--warn:#a46b00;--bad:#b3261e;--info:#3b5ba5;--soft:#f3efe8}
@media (prefers-color-scheme:dark){:root{--bg:#141311;--panel:#1c1a17;--ink:#ece8e1;--mute:#a39d93;--line:#34302a;--accent:#e08a5b;--ok:#5fbf86;--warn:#e0a83a;--bad:#ef6b61;--info:#7f9cf0;--soft:#24211d}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1060px;margin:0 auto;padding:32px 20px 64px}h1{font-size:28px;line-height:1.25;margin:6px 0 10px}h2{font-size:19px;margin:38px 0 12px;padding-top:10px;border-top:1px solid var(--line)}
h3,h4,h5,h6{font-size:16px;margin:18px 0 6px}.eyebrow{font:12px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
.meta{color:var(--mute);font-size:13px}.pill{display:inline-block;border-radius:999px;padding:1px 9px;font-size:12px;border:1px solid currentColor}
.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}.mute{color:var(--mute)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px;margin:18px 0}.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px 12px}
.stat b{display:block;font-size:20px}.stat span{color:var(--mute);font-size:12px}.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 20px}
.answer p:first-child{font-size:17px}a{color:var(--accent)}a.cite{font-size:11px;vertical-align:super;text-decoration:none;margin-left:2px;padding:0 4px;border:1px solid var(--line);border-radius:5px;position:relative;color:var(--accent)}
a.cite:hover::after,a.cite:focus::after{content:attr(data-q);position:absolute;left:0;top:1.8em;z-index:9;width:min(380px,80vw);white-space:normal;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:13px;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,.15)}
table{width:100%;border-collapse:collapse;font-size:13.5px}th,td{text-align:left;vertical-align:top;padding:7px 8px;border-bottom:1px solid var(--line)}th{color:var(--mute);font-weight:600;font-size:12px}
td.num{text-align:right;font-variant-numeric:tabular-nums}.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}details{margin:6px 0}summary{cursor:pointer;color:var(--mute)}
blockquote{margin:6px 0;padding:6px 10px;border-left:3px solid var(--line);background:var(--soft);border-radius:0 8px 8px 0;font-size:13.5px}
svg{width:100%;height:auto;display:block}.node{fill:var(--panel);stroke:var(--line)}.node.q{stroke:var(--accent)}.edge{fill:none;stroke:var(--line);stroke-width:2}
.fo{font:12.5px/1.35 ui-sans-serif,system-ui,sans-serif;color:var(--ink);overflow:hidden;height:100%}text{fill:var(--ink)}.mh{font-size:11px;fill:var(--mute);letter-spacing:.06em;text-transform:uppercase}
.big{font-size:20px;font-weight:700}.small{font-size:11.5px;fill:var(--mute)}.grid{stroke:var(--line)}.v-ok,.t-ok{fill:var(--ok)}.v-warn,.t-warn{fill:var(--warn)}.v-bad,.t-bad{fill:var(--bad)}.v-mute{fill:var(--mute)}.t-info{fill:var(--info)}
rect.k-model{opacity:.75}.legend{font-size:12px;color:var(--mute)}.sw{display:inline-block;width:12px;height:8px;border-radius:2px;margin:0 4px 0 12px;background:var(--info)}.sw.k-fetch{background:var(--ok)}.sw.k-search{background:var(--warn)}
.log{max-height:520px;overflow:auto;font:12px/1.5 ui-monospace,Menlo,monospace;background:var(--soft);border-radius:10px;padding:10px}.log div{white-space:pre-wrap;word-break:break-word}
footer{margin-top:40px;color:var(--mute);font-size:12px}@media print{a.cite:hover::after{display:none}.log{max-height:none}details{display:block}main{padding:0}}`;

function logLine(e: TraceEvent): string {
  const t = e.at.slice(11, 19);
  const lane = e.lane ?? "—";
  const body = (() => {
    switch (e.kind) {
      case "run_started": return `start · ${e.depth} · ${e.goal} · $${e.budget_usd}`;
      case "plan": return `plan · ${e.lanes.map((l) => `${l.id}: ${l.title}`).join(" | ")}`;
      case "model_call": return `${e.ok ? "model" : "model FAILED"} · ${e.role} · ${e.channel}/${e.model} · ${e.purpose} · ${e.input_tokens}+${e.output_tokens} tok · ${usd(e.usd)} · ${e.ms} ms`;
      case "query": return `query · ${e.provider} · ${e.query}`;
      case "results": return `results · ${e.provider} · ${e.hits} (${e.new_hits} new) · ${e.query}`;
      case "fetch": return `fetch · ${e.tier} · ${e.status}${e.http_status ? ` ${e.http_status}` : ""} · ${e.url} · ${e.ms} ms`;
      case "read": return `read · ${e.source_id} · ${e.quotes} quotes${e.rejected ? `, ${e.rejected} rejected` : ""} · ${e.note}`;
      case "reflect": return `reflect · round ${e.round} · ${e.done ? "done" : "continue"} · ${e.reason}${e.next_queries.length ? ` · next: ${e.next_queries.join(" | ")}` : ""}`;
      case "claim": return `claim · ${e.claim_id} · ${e.verdict} · ${e.text}`;
      case "section": return `section · ${e.title} · ${e.chars} chars`;
      case "budget": return `budget · ${usd(e.spent_usd)} / ${usd(e.cap_usd)} · ${e.pages} pages · ${e.queries} queries`;
      case "note": return `${e.level} · ${e.text}`;
      case "run_finished": return `finished · ${e.status}${e.partial ? ` (${e.partial})` : ""}`;
    }
  })();
  return `<div>${esc(`${t}  ${lane.padEnd(4)}  ${body}`)}</div>`;
}

export function reportHtml(r: ResearchReport): string {
  const lang = langOf(r.request.language, r.request.question);
  const w = wordsOf(lang);
  const v = processView(r.trace, r.plan.lanes);
  /** the hover text of [n]: the first quote taken from that source, its site and date */
  const cite = (n: number) => {
    const s = r.sources.find((x) => x.n === n);
    if (!s) return { title: "", ok: false };
    const q = r.quotes.find((x) => x.source_id === s.id);
    return { title: `${q ? `“${q.text.slice(0, 280)}”` : s.title} — ${s.domain}${s.published ? `, ${s.published}` : ""}`, ok: true };
  };
  const tone = r.status === "done" ? "ok" : r.status === "partial" ? "warn" : "bad";
  const s = r.stats;
  const stat = (n: string | number, label: string) => `<div class="stat"><b>${esc(String(n))}</b><span>${esc(label)}</span></div>`;
  const verdictCount = (k: keyof Words["v"]) => r.claims.filter((c) => c.verdict === k).length;
  const claimRows = r.claims
    .map((c) => {
      const qs = c.quote_ids.map((i) => r.quotes[i]).filter((q): q is NonNullable<typeof q> => q !== undefined);
      const quotes = qs.map((q) => {
        const src = r.sources.find((x) => x.id === q.source_id);
        return `<blockquote>“${esc(q.text)}” <a href="#src-${src?.n ?? 0}">[${src?.n ?? "?"}]</a> <span class="meta">${esc(src?.domain ?? "")}</span></blockquote>`;
      });
      return `<tr><td><span class="pill ${VERDICT_TONE[c.verdict]}">${esc(w.v[c.verdict])}</span></td><td>${esc(c.text)}${c.as_of ? ` <span class="meta">(${esc(w.asOf.toLowerCase())} ${esc(c.as_of)})</span>` : ""}<details><summary>${qs.length} ${esc(w.quotes.toLowerCase())}</summary>${quotes.join("")}</details></td><td class="mono">${c.source_ns.map((n) => `<a href="#src-${n}">[${n}]</a>`).join(" ")}</td></tr>`;
    })
    .join("");
  const srcRows = r.sources
    .map((x) => `<tr id="src-${x.n}"><td class="num">${x.n}</td><td><a href="${esc(x.final_url)}" rel="noreferrer noopener">${esc(x.title)}</a>${x.final_url !== x.url ? `<div class="meta mono">${esc(x.url)}</div>` : ""}</td><td>${esc(x.domain)}</td><td>${esc(x.published ?? "—")}</td><td>${esc(w.tiers[x.tier])}</td><td class="mono">${esc(x.fetched_at.slice(0, 16).replace("T", " "))}</td><td class="mono" title="${esc(x.content_hash)}">${esc(x.content_hash.slice(7, 19))}…</td></tr>`)
    .join("");
  const roleRows = v.roles
    .map((x) => `<tr><td>${esc(w.role[x.role])}</td><td>${esc(x.channel)}</td><td class="mono">${esc(x.model)}</td><td class="num">${x.calls}${x.failed ? ` <span class="bad">(${x.failed}✕)</span>` : ""}</td><td class="num">${(x.input_tokens + x.output_tokens).toLocaleString("en")}</td><td class="num">${usd(x.usd)}</td><td class="num">${duration(x.ms)}</td></tr>`)
    .join("");
  const tierRows = (Object.keys(v.tiers) as (keyof ProcessView["tiers"])[])
    .map((t) => [t, v.tiers[t]] as const)
    .filter(([, c]) => Object.values(c).some((n) => n > 0))
    .map(([t, c]) => `<tr><td>${esc(w.tiers[t])}</td>${(["ok", "thin", "blocked", "failed", "robots", "too_large", "skipped"] as const).map((k) => `<td class="num${k === "ok" ? " ok" : k === "blocked" || k === "failed" ? " bad" : ""}">${c[k] || ""}</td>`).join("")}</tr>`)
    .join("");
  const laneNotes = v.lanes
    .filter((l) => l.id !== "main")
    .map((l) => `<li><b>${esc(l.id)}</b> ${esc(l.title)} — ${l.queries.length} ${esc(w.stats.queries)}, ${l.read} ${esc(w.stats.pages_read)}, ${l.quotes} ${esc(w.stats.quotes)}${l.rejected ? `, ${l.rejected} ${esc(w.rejected)}` : ""}${l.stop ? `. ${esc(w.stop)}: ${esc(l.stop)}` : ""}<details><summary>${esc(w.stats.queries)}</summary><div class="mono">${l.queries.map(esc).join("<br>")}</div></details></li>`)
    .join("");
  const json = JSON.stringify(r).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(`${w.title}: ${r.request.question.slice(0, 80)}`)}</title><style>${CSS}</style></head>
<body><main>
<div class="eyebrow">${esc(w.title)} · ${esc(w.depth[r.request.depth])} · ${esc(w.goal[r.request.goal])}</div>
<h1>${esc(r.request.question)}</h1>
<div class="meta">${esc(w.asOf)} ${esc(r.finished_at.slice(0, 10))} · <span class="pill ${tone}">${esc(w.status[r.status])}${r.partial ? `: ${esc(w.partial[r.partial])}` : ""}</span> · ${duration(s.ms)} · ${usd(s.usd)} · ${(s.input_tokens + s.output_tokens).toLocaleString("en")} ${esc(w.stats.tokens)}</div>
<div class="stats">${stat(s.queries, w.stats.queries)}${stat(s.results, w.stats.results)}${stat(s.pages_read, w.stats.pages_read)}${stat(s.domains, w.stats.domains)}${stat(s.quotes, w.stats.quotes)}${stat(verdictCount("confirmed"), w.v.confirmed)}${stat(verdictCount("single"), w.v.single)}${stat(verdictCount("conflict"), w.v.conflict)}</div>
<section class="card answer"><div class="eyebrow">${esc(w.answer)}</div>${mdToHtml(r.summary, cite)}</section>
${r.sections.map((x) => `<h2>${esc(x.title)}</h2>${mdToHtml(x.body, cite)}`).join("\n")}
<h2>${esc(w.claims)}</h2>${r.claims.length === 0 ? `<p class="meta">${esc(w.noClaims)}</p>` : `<table><thead><tr><th>${esc(w.verdict)}</th><th>${esc(w.claim)}</th><th>${esc(w.sources)}</th></tr></thead><tbody>${claimRows}</tbody></table>`}
${r.unresolved.length > 0 ? `<h2>${esc(w.unresolved)}</h2><ul>${r.unresolved.map((u) => `<li>${esc(u)}</li>`).join("")}</ul>` : ""}
<h2>${esc(w.sources)}</h2><table><thead><tr><th>${esc(w.col.n)}</th><th>${esc(w.col.title)}</th><th>${esc(w.col.domain)}</th><th>${esc(w.col.published)}</th><th>${esc(w.col.tier)}</th><th>${esc(w.col.fetched)}</th><th>${esc(w.col.hash)}</th></tr></thead><tbody>${srcRows}</tbody></table>
<h2>${esc(w.process)}</h2><p><b>${esc(w.plan)}:</b> ${esc(r.plan.strategy)}</p><ul>${laneNotes}</ul>
<h3>${esc(w.map)}</h3>${processMap(v, r, w)}
<h3>${esc(w.timeline)}</h3>${timelineSvg(v, w)}
<h3>${esc(w.models)}</h3><table><thead><tr><th>${esc(w.col.role)}</th><th>${esc(w.col.channel)}</th><th>${esc(w.col.model)}</th><th>${esc(w.col.calls)}</th><th>${esc(w.col.tokens)}</th><th>${esc(w.col.usd)}</th><th>${esc(w.col.time)}</th></tr></thead><tbody>${roleRows}</tbody></table>
${tierRows ? `<h3>${esc(w.ladder)}</h3><table><thead><tr><th>${esc(w.col.tier)}</th><th>ok</th><th>thin</th><th>blocked</th><th>failed</th><th>robots</th><th>too large</th><th>skipped</th></tr></thead><tbody>${tierRows}</tbody></table>` : ""}
<details><summary>${esc(w.trace)} (${r.trace.length})</summary><div class="log">${r.trace.map(logLine).join("")}</div></details>
<details><summary>${esc(w.json)}</summary><p class="meta">id ${esc(r.id)} · report v${r.version}</p></details>
<footer>${esc(w.generated)}</footer>
</main><script type="application/json" id="report-data">${json}</script></body></html>`;
}
