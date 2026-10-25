import type { Metadata } from "next";
import { McpCatalog } from "../../components/mcp-catalog";
import { PermissionEditor } from "../../components/permission-editor";
import { Shell } from "../../components/shell";
import { Meter, Panel, SampleNote, ToolCalls } from "../../components/workbench-parts";
import { getT } from "../../i18n/server";
import { pageName } from "../../lib/brand";
import { SAMPLE } from "../../lib/sample";
import { withSample } from "../../lib/workbench";
import { db } from "../../lib/server/db";
import { pageCtx } from "../../lib/server/page";
import { hasCap } from "../../lib/server/roles";
import { mcpCatalog } from "../../lib/server/mcp";
import { sampleOn } from "../../lib/server/sample-pref";
import { tools } from "../../lib/server/workbench";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: pageName((await getT())("tools.title")) };
}

const STATUS = { up: { c: "text-ok", m: "bg-ok" }, slow: { c: "text-warn", m: "bg-warn" }, down: { c: "text-bad", m: "bg-bad" }, off: { c: "text-mute", m: "bg-idle" } } as const;
const PERM = { allow: "border-ok/40 bg-ok-soft text-ok", ask: "border-warn/40 bg-warn-soft text-warn", deny: "border-line text-mute" } as const;

// D-307 / design H3: MCP servers, skills, plugins, who may use what, and the live call log. Everything goes through the gate.
export default async function ToolsPage() {
  const c = await pageCtx();
  const tr = await getT();
  const show = await sampleOn();
  const real = await tools(db(), c.uid, c.org);
  const canEdit = await hasCap(db(), c.uid, c.org, "tools.manage");
  const catalog = canEdit ? await mcpCatalog(db(), c.uid, c.org) : [];
  const t = withSample(real, { mcp: SAMPLE.mcp, skills: SAMPLE.skills, plugins: SAMPLE.plugins, permissions: SAMPLE.permissions, calls: SAMPLE.calls }, (x) => x.mcp.length + x.skills.length + x.plugins.length + x.permissions.length + x.calls.length === 0, show);
  const d = t.data;
  const max = Math.max(1, ...d.mcp.map((m) => m.calls_hour));
  const subjects = [...new Set(d.permissions.map((p) => p.subject))];
  const cols = [...new Set(d.permissions.map((p) => p.tool))];
  return (
    <Shell current="tools" waiting={c.waiting} wide>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{tr("tools.title")}</h1>
      <p className="mt-1 text-sm text-mute">{tr("tools.summary", { mcp: d.mcp.length, skills: d.skills.length, plugins: d.plugins.length })}</p>
      {t.sample && <SampleNote what={tr("tools.sample")} table="mcp_servers, skills, plugins, tool_calls" t={tr} />}
      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel title={tr("tools.mcp")} aside={tr("tools.mcpAside")} className="overflow-x-auto">
          {d.mcp.length === 0 ? <p className="p-4 text-sm text-mute">{tr("tools.noMcp")}</p> : (
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="text-left font-display text-[11px] uppercase tracking-[0.1em] text-mute"><th scope="col" className="px-4 py-2">{tr("tools.col.server")}</th><th scope="col">{tr("tools.col.transport")}</th><th scope="col">{tr("tools.col.tools")}</th><th scope="col" className="w-40">{tr("tools.col.calls")}</th><th scope="col">{tr("tools.col.projects")}</th><th scope="col" className="px-4">{tr("tools.col.egress")}</th></tr></thead>
              <tbody>
                {d.mcp.map((m) => (
                  <tr key={m.name} className="border-t border-line">
                    <td className="px-4 py-2"><span className="flex items-center gap-2"><span aria-hidden="true" className={`hex inline-block h-2.5 w-3 ${STATUS[m.status].m}`} /><span className="font-mono text-xs">{m.name}</span></span><span className={`block text-[11px] ${STATUS[m.status].c}`}>{tr(`tools.status.${m.status}`)}{m.latency_ms !== null ? ` · ${tr.num(m.latency_ms)} ms` : ""}</span></td>
                    <td className="font-mono text-xs text-mute">{m.transport}</td>
                    <td className="font-mono text-xs">{m.tools}</td>
                    <td><span className="flex items-center gap-2"><Meter value={m.calls_hour} max={max} label={tr("tools.callsMeter", { name: m.name, n: m.calls_hour })} /><span className="w-10 font-mono text-[11px]">{m.calls_hour}</span></span></td>
                    <td className="text-xs text-mute">{m.repos === null ? tr("tools.all") : m.repos.length ? m.repos.join(", ") : "—"}</td>
                    <td className="px-4 font-mono text-[11px] text-mute">{m.egress_hosts.join(", ") || tr("tools.egressOff")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
                  {canEdit && <McpCatalog rows={catalog} />}
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title={tr("tools.skills", { n: d.skills.length })} aside={tr("tools.skillsAside")}>
            <ul className="divide-y divide-line">
              {d.skills.map((s) => <li key={s.name} className="flex items-center gap-3 px-4 py-2 text-sm"><span className="w-28 truncate font-mono text-xs">{s.name}</span><span className="min-w-0 flex-1 truncate text-xs text-mute">{s.blocked_reason ? <span className="text-bad">{tr("tools.skillBlocked", { reason: s.blocked_reason })}</span> : s.description}</span><span className="text-[11px] text-mute">{tr(`tools.source.${s.source}`)}</span><span className="w-6 text-right font-mono text-xs text-accent-text">{s.used_by}</span></li>)}
              {d.skills.length === 0 && <li className="px-4 py-3 text-sm text-mute">{tr("tools.noSkills")}</li>}
            </ul>
          </Panel>
          <Panel title={tr("tools.plugins", { n: d.plugins.length })}>
            <ul className="divide-y divide-line">
              {d.plugins.map((p) => <li key={p.name} className="flex items-center gap-3 px-4 py-2 text-sm"><span aria-hidden="true" className={`size-2 rounded-full ${p.enabled ? "bg-ok" : "bg-idle"}`} /><span className="flex-1">{p.name}</span><span className="text-[11px] text-mute">{p.enabled ? tr("tools.on") : tr("tools.off")} · {p.description}</span></li>)}
              {d.plugins.length === 0 && <li className="px-4 py-3 text-sm text-mute">{tr("tools.noPlugins")}</li>}
            </ul>
          </Panel>
        </div>
        <Panel title={tr("tools.perms")} aside={tr("tools.permsAside")} className="overflow-x-auto">
          {d.permissions.length === 0 ? <p className="p-4 text-sm text-mute">{tr("tools.noPerms")}</p> : (
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr><td /><>{cols.map((x) => <th key={x} scope="col" className="px-1 py-2 text-left font-mono text-[11px] font-normal text-mute">{x}</th>)}</></tr></thead>
              <tbody>
                {subjects.map((s) => (
                  <tr key={s}>
                    <th scope="row" className="px-4 py-1 text-left font-normal">{s}</th>
                    {cols.map((x) => { const p = d.permissions.find((q) => q.subject === s && q.tool === x); const dec = p?.decision ?? "deny"; return <td key={x} className="px-1 py-1"><span className={`block rounded-md border py-1 text-center text-xs ${PERM[dec]}`}>{tr(`tools.perm.${dec}`)}</span></td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canEdit && <PermissionEditor />}
        </Panel>
        <Panel title={tr("tools.calls")} aside={<span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="beat size-1.5 rounded-full bg-ok" />{tr("tools.live")}</span>}>
          {d.calls.length === 0 ? <p className="p-4 text-sm text-mute">{tr("task.noCalls")}</p> : <ToolCalls calls={d.calls} t={tr} />}
        </Panel>
      </div>
    </Shell>
  );
}
