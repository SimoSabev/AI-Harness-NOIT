import type { Metadata } from "next";
import { Shell } from "../../components/shell";
import { Meter, Panel, SampleNote, ToolCalls } from "../../components/workbench-parts";
import { pageName } from "../../lib/brand";
import { SAMPLE } from "../../lib/sample";
import { withSample } from "../../lib/workbench";
import { db } from "../../lib/server/db";
import { pageCtx } from "../../lib/server/page";
import { sampleOn } from "../../lib/server/sample-pref";
import { tools } from "../../lib/server/workbench";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: pageName("Инструменти") };

const STATUS = { up: { t: "жив", c: "text-ok", m: "bg-ok" }, slow: { t: "бави", c: "text-warn", m: "bg-warn" }, down: { t: "не отговаря", c: "text-bad", m: "bg-bad" }, off: { t: "изключен", c: "text-mute", m: "bg-idle" } } as const;
const SOURCE = { repo: "репо", user: "твой", team: "екип", builtin: "вграден" } as const;
const PERM = { allow: { t: "да", c: "border-ok/40 bg-ok-soft text-ok" }, ask: { t: "питай", c: "border-warn/40 bg-warn-soft text-warn" }, deny: { t: "не", c: "border-line text-mute" } } as const;

// D-307 / design H3: MCP servers, skills, plugins, who may use what, and the live call log. Everything goes through the gate.
export default async function ToolsPage() {
  const c = await pageCtx();
  const show = await sampleOn();
  const real = await tools(db(), c.uid, c.org);
  const t = withSample(real, { mcp: SAMPLE.mcp, skills: SAMPLE.skills, plugins: SAMPLE.plugins, permissions: SAMPLE.permissions, calls: SAMPLE.calls }, (x) => x.mcp.length + x.skills.length + x.plugins.length + x.permissions.length + x.calls.length === 0, show);
  const d = t.data;
  const max = Math.max(1, ...d.mcp.map((m) => m.calls_hour));
  const subjects = [...new Set(d.permissions.map((p) => p.subject))];
  const cols = [...new Set(d.permissions.map((p) => p.tool))];
  return (
    <Shell current="tools" waiting={c.waiting} wide>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Инструменти</h1>
      <p className="mt-1 text-sm text-mute">{d.mcp.length} MCP сървъра · {d.skills.length} скила · {d.plugins.length} плъгина · всичко минава през вратата на пясъчника</p>
      {t.sample && <SampleNote what="MCP сървърите, скиловете и плъгините на агентите и всяко тяхно повикване" table="mcp_servers, skills, plugins, tool_calls" />}
      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title="MCP сървъри" aside="кой е жив, колко се ползва, къде има мрежа" className="overflow-x-auto">
          {d.mcp.length === 0 ? <p className="p-4 text-sm text-mute">Няма свързани MCP сървъри.</p> : (
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="text-left font-display text-[11px] uppercase tracking-[0.1em] text-mute"><th scope="col" className="px-4 py-2">Сървър</th><th scope="col">Връзка</th><th scope="col">Тулове</th><th scope="col" className="w-40">Повиквания/ч</th><th scope="col">Проекти</th><th scope="col" className="px-4">Мрежа през вратата</th></tr></thead>
              <tbody>
                {d.mcp.map((m) => (
                  <tr key={m.name} className="border-t border-line">
                    <td className="px-4 py-2"><span className="flex items-center gap-2"><span aria-hidden="true" className={`hex inline-block h-2.5 w-3 ${STATUS[m.status].m}`} /><span className="font-mono text-xs">{m.name}</span></span><span className={`block text-[11px] ${STATUS[m.status].c}`}>{STATUS[m.status].t}{m.latency_ms !== null ? ` · ${m.latency_ms} ms` : ""}</span></td>
                    <td className="font-mono text-xs text-mute">{m.transport}</td>
                    <td className="font-mono text-xs">{m.tools}</td>
                    <td><span className="flex items-center gap-2"><Meter value={m.calls_hour} max={max} label={`${m.name}: ${m.calls_hour} повиквания за час`} /><span className="w-10 font-mono text-[11px]">{m.calls_hour}</span></span></td>
                    <td className="text-xs text-mute">{m.repos === null ? "всички" : m.repos.length ? m.repos.join(", ") : "—"}</td>
                    <td className="px-4 font-mono text-[11px] text-mute">{m.egress_hosts.join(", ") || "изключен"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title={`Скилове · ${d.skills.length}`} aside="кой ги ползва (7 дни)">
            <ul className="divide-y divide-line">
              {d.skills.map((s) => <li key={s.name} className="flex items-center gap-3 px-4 py-2 text-sm"><span className="w-28 truncate font-mono text-xs">{s.name}</span><span className="min-w-0 flex-1 truncate text-xs text-mute">{s.description}</span><span className="text-[11px] text-mute">{SOURCE[s.source]}</span><span className="w-6 text-right font-mono text-xs text-accent-text">{s.used_by}</span></li>)}
              {d.skills.length === 0 && <li className="px-4 py-3 text-sm text-mute">Няма скилове.</li>}
            </ul>
          </Panel>
          <Panel title={`Плъгини · ${d.plugins.length}`}>
            <ul className="divide-y divide-line">
              {d.plugins.map((p) => <li key={p.name} className="flex items-center gap-3 px-4 py-2 text-sm"><span aria-hidden="true" className={`size-2 rounded-full ${p.enabled ? "bg-ok" : "bg-idle"}`} /><span className="flex-1">{p.name}</span><span className="text-[11px] text-mute">{p.enabled ? "включен" : "изключен"} · {p.description}</span></li>)}
              {d.plugins.length === 0 && <li className="px-4 py-3 text-sm text-mute">Няма плъгини.</li>}
            </ul>
          </Panel>
        </div>
        <Panel title="Права" aside="кой агент кой инструмент · „питай“ спира агента и праща известие" className="overflow-x-auto">
          {d.permissions.length === 0 ? <p className="p-4 text-sm text-mute">Няма изрични права; важат правилата на репото.</p> : (
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr><td /><>{cols.map((x) => <th key={x} scope="col" className="px-1 py-2 text-left font-mono text-[11px] font-normal text-mute">{x}</th>)}</></tr></thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={s}>
                    <th scope="row" className="px-4 py-1 text-left font-normal">{s}</th>
                    {cols.map((x) => { const p = d.permissions.find((q) => q.subject === s && q.tool === x); const v = PERM[p?.decision ?? "deny"]; return <td key={x} className="px-1 py-1"><span className={`block rounded-md border py-1 text-center text-xs ${v.c}`}>{v.t}</span></td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Последни повиквания" aside={<span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="beat size-1.5 rounded-full bg-ok" />живо</span>}>
          {d.calls.length === 0 ? <p className="p-4 text-sm text-mute">Още няма повиквания.</p> : <ToolCalls calls={d.calls} />}
        </Panel>
      </div>
    </Shell>
  );
}
