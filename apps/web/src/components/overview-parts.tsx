import Link from "next/link";
import { agentLabel } from "../lib/agents";
import type { Flow, ProjectSummary } from "../lib/overview";
import { rhythm } from "../lib/overview";
import type { OverviewTask } from "../lib/overview";
import { ago } from "../lib/status";
import type { Tone } from "../lib/status";
import { HEALTH } from "./shell";
import { StatusBadge, TONE, card, label } from "./ui";

// D-305: the pieces of the start page (design H1): the flow map, the swarm, project tiles / columns, the rhythm.
export function FlowMap({ flow }: { flow: Flow }) {
  const steps: { l: string; v: number; sub: string; c: string; you?: boolean }[] = [
    { l: "На опашка", v: flow.queued, sub: "чакат място", c: "text-ink" },
    { l: "Агенти", v: flow.running, sub: "работят в пясъчник", c: "text-ok" },
    { l: "Мандат", v: flow.checking, sub: "проверява", c: "text-info" },
    { l: "Ти", v: flow.waiting, sub: "решения чакат", c: "text-warn", you: true },
    { l: "Готово", v: flow.done24h, sub: "за 24 ч", c: "text-ink" },
  ];
  return (
    <ol aria-label="Къде са задачите" className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-0">
      {steps.map((s, i) => (
        <li key={s.l} className="flex items-center">
          <div className={`flex-1 rounded-xl border bg-panel px-4 py-3 ${s.you && s.v > 0 ? "border-warn/50" : "border-line"}`}>
            <p className={label}>{s.l}</p>
            <p className={`font-display text-3xl font-semibold leading-tight ${s.c}`}>{s.v}</p>
            <p className="text-xs text-mute">{s.sub}</p>
          </div>
          {i < steps.length - 1 && <span aria-hidden="true" className="hidden h-px w-4 shrink-0 bg-line-strong sm:block" />}
        </li>
      ))}
    </ol>
  );
}

export function Swarm({ swarm }: { swarm: { id: string; tone: Tone; label: string }[] }) {
  if (swarm.length === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className={label}>Агенти и задачи сега · {swarm.length}</p>
      <ul className="flex flex-wrap gap-0.5">
        {swarm.map((s) => (
          <li key={s.id}><Link href={`/tasks/${s.id}`} aria-label={`${s.label}: ${s.id}`} title={s.label} className="flex size-6 items-center justify-center rounded transition hover:bg-raised"><span aria-hidden="true" className={`hex block h-4 w-[18px] ${TONE[s.tone].mark.replace(" animate-pulse", "")}`} /></Link></li>
        ))}
      </ul>
    </div>
  );
}

type P = ProjectSummary<OverviewTask & { reasons?: string[] }>;

function ItemLine({ t }: { t: P["items"][number] }) {
  return (
    <li>
      <Link href={`/tasks/${t.id}`} className="flex items-center gap-3 rounded-lg border border-line bg-canvas px-3 py-2 transition hover:border-line-strong">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{t.text}</span>
          <span className="block text-xs text-mute">{agentLabel(t.agent)} · {ago(t.updated_at)}</span>
        </span>
        <StatusBadge tone={t.status.tone} label={t.status.label} />
      </Link>
    </li>
  );
}

export function ProjectTiles({ projects }: { projects: P[] }) {
  return (
    <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => (
        <li key={p.full_name} className={`${card} flex flex-col gap-3 p-4 ${p.health === "bad" ? "border-bad/40" : p.health === "warn" ? "border-warn/40" : ""}`}>
          <Link href={`/?project=${encodeURIComponent(p.full_name)}`} className="flex items-center gap-2">
            <span aria-hidden="true" className={`hex inline-block h-3.5 w-4 ${HEALTH[p.health].mark}`} />
            <span className="font-display text-base font-semibold">{p.name}</span>
            <span className="ml-auto truncate font-mono text-[11px] text-mute">{p.full_name}</span>
          </Link>
          <p className={`font-display text-xl font-semibold ${HEALTH[p.health].text}`}>{p.word}</p>
          {p.items.length > 0 && <ul className="space-y-1.5">{p.items.slice(0, 2).map((t) => <ItemLine key={t.id} t={t} />)}</ul>}
          <p className="mt-auto flex gap-3 font-mono text-[11px] text-mute"><span>{p.active} в работа</span><span>{p.waiting} чакат</span><span>{p.done24h} готови за 24 ч</span></p>
        </li>
      ))}
    </ul>
  );
}

export function ProjectColumns({ projects }: { projects: P[] }) {
  return (
    <div className="mt-6 flex snap-x gap-3 overflow-x-auto pb-4">
      {projects.map((p) => (
        <section key={p.full_name} aria-labelledby={`pc-${p.name}`} className="flex w-72 shrink-0 snap-start flex-col gap-2 rounded-xl border border-line bg-panel p-3" style={{ borderTopWidth: 3 }}>
          <h2 id={`pc-${p.name}`} className="flex items-center gap-2 px-1 pb-1">
            <span aria-hidden="true" className={`hex inline-block h-3 w-3.5 ${HEALTH[p.health].mark}`} />
            <span className="font-display text-sm font-semibold">{p.name}</span>
            <span className={`ml-auto text-xs ${HEALTH[p.health].text}`}>{p.word}</span>
          </h2>
          {p.items.length === 0 ? <p className="px-1 py-2 text-xs text-mute">Нищо в работа · {p.done24h} готови за 24 ч</p> : <ul className="space-y-1.5">{p.items.map((t) => <ItemLine key={t.id} t={t} />)}</ul>}
          <Link href="/tasks/new" className="mt-auto rounded-lg border border-dashed border-line-strong px-3 py-2 text-center text-xs text-mute hover:text-ink">+ задача</Link>
        </section>
      ))}
    </div>
  );
}

export function Rhythm({ tasks }: { tasks: OverviewTask[] }) {
  const rows = rhythm(tasks);
  const shade = (n: number) => (n === 0 ? "bg-raised" : n === 1 ? "bg-accent/30" : n === 2 ? "bg-accent/55" : "bg-accent/85");
  return (
    <section aria-labelledby="rh" className={`${card} mt-6 overflow-x-auto p-4`}>
      <h2 id="rh" className="font-display text-sm font-semibold">Ритъм · 7 дни <span className="font-sans font-normal text-mute">по-наситено = повече готови задачи, червена точка = провал</span></h2>
      <table className="mt-3 w-full min-w-[520px] border-separate border-spacing-1">
        <thead><tr><th className="sr-only">Ден</th>{Array.from({ length: 12 }, (_, i) => <th key={i} scope="col" className="font-mono text-[10px] font-normal text-mute">{String(i * 2).padStart(2, "0")}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day}>
              <th scope="row" className="w-12 pr-2 text-left text-xs font-normal text-mute">{r.day}</th>
              {r.cells.map((c, i) => (
                <td key={i} className={`relative h-6 rounded ${shade(c.done)}`}>
                  <span className="sr-only">{c.done} готови{c.bad ? `, ${c.bad} провал` : ""}</span>
                  {c.bad > 0 && <span aria-hidden="true" className="absolute right-1 top-1 size-1.5 rounded-full bg-bad" />}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
