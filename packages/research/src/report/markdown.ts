import type { ResearchReport } from "@mandat/contract";
import { processView } from "./process.js";
import { duration, langOf, usd, wordsOf } from "./text.js";

// E9г (D-397): the report as Markdown — the same content as the HTML, for notes, PRs and the knowledge base.

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function reportMarkdown(r: ResearchReport): string {
  const w = wordsOf(langOf(r.request.language, r.request.question));
  const v = processView(r.trace, r.plan.lanes);
  const s = r.stats;
  const out: string[] = [];
  out.push(`# ${r.request.question}`, "");
  out.push(`*${w.asOf} ${r.finished_at.slice(0, 10)} · ${w.depth[r.request.depth]} · ${w.goal[r.request.goal]} · ${w.status[r.status]}${r.partial ? ` (${w.partial[r.partial]})` : ""} · ${duration(s.ms)} · ${usd(s.usd)}*`, "");
  out.push(`${s.queries} ${w.stats.queries} · ${s.results} ${w.stats.results} · ${s.pages_read} ${w.stats.pages_read} · ${s.domains} ${w.stats.domains} · ${s.quotes} ${w.stats.quotes} · ${s.claims} ${w.stats.claims}`, "");
  out.push(`## ${w.answer}`, "", r.summary, "");
  for (const x of r.sections) out.push(`## ${x.title}`, "", x.body, "");
  out.push(`## ${w.claims}`, "");
  if (r.claims.length === 0) out.push(w.noClaims, "");
  else {
    out.push(`| ${w.verdict} | ${w.claim} | ${w.sources} |`, "| --- | --- | --- |");
    for (const c of r.claims) out.push(`| ${w.v[c.verdict]} | ${cell(c.text)}${c.as_of ? ` (${c.as_of})` : ""} | ${c.source_ns.map((n) => `[${n}]`).join(" ")} |`);
    out.push("");
    for (const c of r.claims) {
      out.push(`**${c.id}** ${c.text}`);
      for (const i of c.quote_ids) {
        const q = r.quotes[i];
        const src = q ? r.sources.find((x) => x.id === q.source_id) : undefined;
        if (q && src) out.push(`> “${q.text.replace(/\n/g, " ")}” — [${src.n}] ${src.domain}`);
      }
      out.push("");
    }
  }
  if (r.unresolved.length > 0) out.push(`## ${w.unresolved}`, "", ...r.unresolved.map((u) => `- ${u}`), "");
  out.push(`## ${w.sources}`, "");
  for (const x of r.sources) out.push(`${x.n}. [${x.title.replace(/[[\]]/g, "")}](${x.final_url}) — ${x.domain}${x.published ? `, ${x.published}` : ""} · ${w.tiers[x.tier]} · \`${x.content_hash.slice(0, 19)}…\``);
  out.push("", `## ${w.process}`, "", `**${w.plan}:** ${r.plan.strategy}`, "");
  for (const l of v.lanes.filter((x) => x.id !== "main")) out.push(`- **${l.id}** ${l.title}: ${l.queries.length} ${w.stats.queries}, ${l.read} ${w.stats.pages_read}, ${l.quotes} ${w.stats.quotes}${l.stop ? ` — ${w.stop}: ${l.stop}` : ""}`);
  out.push("", `| ${w.col.role} | ${w.col.channel} | ${w.col.model} | ${w.col.calls} | ${w.col.tokens} | ${w.col.usd} |`, "| --- | --- | --- | --- | --- | --- |");
  for (const x of v.roles) out.push(`| ${w.role[x.role]} | ${cell(x.channel)} | ${cell(x.model)} | ${x.calls} | ${x.input_tokens + x.output_tokens} | ${usd(x.usd)} |`);
  out.push("", `---`, `*${w.generated}*`, "");
  return out.join("\n");
}
