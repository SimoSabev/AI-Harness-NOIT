import type { ReactNode } from "react";
import type { T } from "../i18n/t";
import type { DiagramName } from "../lib/docs";

// E9g B step 7 (D-378): the hand-made diagrams of /docs. Inline SVG with the theme tokens only (Tailwind fill-/stroke-/
// text- classes), so they follow the dark and the light theme; the labels sit in <foreignObject> boxes so English and
// Bulgarian wrap on their own. Each is one image for assistive tech: role="img" + <title> + <desc> (the full meaning).

type Tone = "plain" | "accent" | "ok" | "warn" | "bad" | "info";
const TONE: Record<Tone, string> = {
  plain: "fill-panel stroke-line-strong",
  accent: "fill-accent-soft stroke-accent",
  ok: "fill-ok-soft stroke-ok",
  warn: "fill-warn-soft stroke-warn",
  bad: "fill-bad-soft stroke-bad",
  info: "fill-info-soft stroke-info",
};

interface BoxProps {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  note?: string | undefined;
  tone?: Tone;
  dashed?: boolean;
}

function Box({ x, y, w, h, title, note, tone = "plain", dashed = false }: BoxProps) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={12} className={TONE[tone]} strokeWidth={1.5} strokeDasharray={dashed ? "5 5" : undefined} />
      <foreignObject x={x} y={y} width={w} height={h}>
        <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
          <span className="font-display text-[13px] font-medium leading-tight text-ink">{title}</span>
          {note && <span className="text-[11px] leading-snug text-mute">{note}</span>}
        </div>
      </foreignObject>
    </g>
  );
}

function Label({ x, y, w, h, children, className = "text-mute" }: { x: number; y: number; w: number; h: number; children: ReactNode; className?: string }) {
  return (
    <foreignObject x={x} y={y} width={w} height={h}>
      <div className={`flex h-full items-center justify-center text-center text-[11px] leading-tight ${className}`}>{children}</div>
    </foreignObject>
  );
}

function Arrow({ id, d, dashed = false, tone = "stroke-mute" }: { id: string; d: string; dashed?: boolean; tone?: string }) {
  return <path d={d} className={`${tone} fill-none`} strokeWidth={1.5} strokeDasharray={dashed ? "4 5" : undefined} markerEnd={`url(#${id}-arrow)`} />;
}

function Frame({ id, name, t, view, minW, children }: { id: string; name: DiagramName; t: T; view: string; minW: number; children: ReactNode }) {
  const title = t(`dg.${id}.title` as Parameters<T>[0]);
  const desc = t(`dg.${id}.desc` as Parameters<T>[0]);
  return (
    <figure className="my-6 overflow-x-auto rounded-xl border border-line bg-canvas p-3" data-diagram={name}>
      <svg viewBox={view} className="w-full" style={{ minWidth: minW }} role="img" aria-labelledby={`${id}-t ${id}-d`}>
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{desc}</desc>
        <defs>
          <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="fill-mute" />
          </marker>
        </defs>
        {children}
      </svg>
      <figcaption className="mt-2 px-1 font-display text-[11px] font-medium uppercase tracking-[0.12em] text-mute">{title}</figcaption>
    </figure>
  );
}

/** Task → contract → agent in sandbox (+ proxy → model) → safe export → Mandat checks → verdict → gate; ledger below. */
function FlowDiagram({ t }: { t: T }) {
  const w = 136;
  const gap = 20;
  const xs = [0, 1, 2, 3, 4].map((i) => 6 + i * (w + gap));
  const top = 16;
  const h = 92;
  const steps = [
    { title: t("dg.flow.task"), note: t("dg.flow.taskNote") },
    { title: t("dg.flow.agent"), note: t("dg.flow.agentNote") },
    { title: t("dg.flow.export"), note: t("dg.flow.exportNote") },
    { title: t("dg.flow.verify"), note: t("dg.flow.verifyNote") },
    { title: t("dg.flow.verdict"), note: t("dg.flow.verdictNote") },
  ];
  const x1 = xs[1] as number;
  return (
    <Frame id="flow" name="flow" t={t} view="0 0 772 340" minW={640}>
      {steps.map((s, i) => (
        <Box key={s.title} x={xs[i] as number} y={top} w={w} h={h} title={s.title} note={s.note} tone={i === 4 ? "accent" : "plain"} />
      ))}
      {xs.slice(0, 4).map((x) => (
        <Arrow key={x} id="flow" d={`M${x + w + 2} ${top + h / 2} h${gap - 6}`} />
      ))}
      <Arrow id="flow" d={`M${x1 + w / 2} ${top + h + 2} V${top + h + 40}`} />
      <Label x={x1 + w / 2 + 4} y={top + h + 6} w={92} h={30} className="justify-start text-left text-mute">{t("dg.flow.token")}</Label>
      <Box x={x1} y={top + h + 44} w={w} h={56} title={t("dg.flow.proxy")} tone="info" />
      <Arrow id="flow" d={`M${x1 + w + 2} ${top + h + 72} h${gap + 12}`} />
      <Box x={(xs[2] as number) + 20} y={top + h + 50} w={w - 20} h={44} title={t("dg.flow.model")} dashed />
      {xs.map((x) => (
        <path key={`l${x}`} d={`M${x + w / 2} ${x === x1 ? top + h + 104 : top + h + 4} V270`} className="stroke-line-strong" strokeWidth={1.5} strokeDasharray="2 6" />
      ))}
      <rect x={6} y={274} width={4 * (w + gap) + w} height={52} rx={12} className="fill-raised stroke-line-strong" strokeWidth={1.5} />
      <Label x={6} y={274} w={4 * (w + gap) + w} h={52} className="font-display text-[13px] text-ink">{t("dg.flow.ledger")}</Label>
    </Frame>
  );
}

/** Your folders (granted with rights; refused ones) → the desktop app checks each use ✕→ the agent gets nothing. */
function PermissionsDiagram({ t }: { t: T }) {
  const chip = "rounded-full border border-line-strong bg-raised px-2 py-0.5 font-mono text-[10px] text-ink";
  return (
    <Frame id="perm" name="permissions" t={t} view="0 0 772 300" minW={640}>
      <rect x={6} y={10} width={300} height={280} rx={14} className="fill-panel stroke-line-strong" strokeWidth={1.5} />
      <foreignObject x={6} y={10} width={300} height={280}>
        <div className="flex h-full flex-col gap-3 p-4 text-left">
          <span className="font-display text-[13px] font-medium text-ink">{t("dg.perm.folders")}</span>
          <div className="rounded-lg border border-accent bg-accent-soft p-2">
            <div className="font-mono text-[11px] text-ink">~/code/shop</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className={chip}>read</span>
              <span className={chip}>apply</span>
              <span className={chip}>open_editor</span>
            </div>
          </div>
          <div className="rounded-lg border border-accent bg-accent-soft p-2">
            <div className="font-mono text-[11px] text-ink">~/code/api</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className={chip}>read</span>
              <span className={chip}>terminal</span>
            </div>
          </div>
          <div className="rounded-lg border border-dashed border-bad bg-bad-soft p-2 text-[11px] leading-snug text-ink">{t("dg.perm.refused")}</div>
        </div>
      </foreignObject>
      <Arrow id="perm" d="M310 150 h40" />
      <Box x={356} y={80} w={190} h={140} title={t("dg.perm.app")} note={t("dg.perm.appNote")} tone="accent" />
      <Label x={356} y={226} w={190} h={40}>{t("dg.perm.uses")}</Label>
      <path d="M550 150 h52" className="stroke-bad fill-none" strokeWidth={1.5} strokeDasharray="4 5" />
      <path d="M570 140 l14 20 M584 140 l-14 20" className="stroke-bad" strokeWidth={2.5} />
      <Box x={606} y={80} w={160} h={140} title={t("dg.perm.agent")} note={t("dg.perm.agentNote")} tone="bad" dashed />
    </Frame>
  );
}

/** Queue → next task → verdict → merged / waits / retry → parked; every branch leads to the next task. */
function NightDiagram({ t }: { t: T }) {
  return (
    <Frame id="night" name="night" t={t} view="0 0 772 384" minW={640}>
      <Box x={6} y={82} w={120} h={64} title={t("dg.night.queue")} />
      <Arrow id="night" d="M130 114 h34" />
      <Box x={170} y={82} w={130} h={64} title={t("dg.night.run")} tone="info" />
      <Arrow id="night" d="M304 114 h34" />
      <Box x={344} y={82} w={120} h={64} title={t("dg.night.verdict")} tone="accent" />
      <Arrow id="night" d="M468 100 C520 100 520 38 574 38" />
      <Label x={470} y={46} w={70} h={22} className="justify-start text-left text-ok">{t("verdict.VERIFIED")}</Label>
      <Box x={580} y={10} w={186} h={56} title={t("dg.night.merge")} tone="ok" />
      <Arrow id="night" d="M468 114 h106" />
      <Box x={580} y={86} w={186} h={56} title={t("dg.night.wait")} tone="warn" />
      <Arrow id="night" d="M404 150 V244" />
      <Label x={250} y={176} w={148} h={40} className="justify-end text-right text-bad">{`${t("verdict.FAILED")} / ${t("verdict.UNKNOWN")}`}</Label>
      <Box x={326} y={248} w={140} h={64} title={t("dg.night.retry")} tone="bad" />
      <Arrow id="night" d="M326 280 C275 280 260 230 260 152" />
      <Arrow id="night" d="M470 280 h104" />
      <Label x={470} y={284} w={104} h={30}>{t("dg.night.out")}</Label>
      <Box x={580} y={252} w={186} h={56} title={t("dg.night.park")} tone="warn" />
      <path d="M673 68 V84 M673 144 V250" className="stroke-line-strong fill-none" strokeWidth={1.5} strokeDasharray="2 6" />
      <Arrow id="night" dashed d="M600 310 V336 H210 V152" />
      <Label x={270} y={316} w={300} h={18} className="text-mute">{t("dg.night.next")}</Label>
      <Label x={6} y={346} w={600} h={30} className="justify-start text-left text-mute">{t("dg.night.stop")}</Label>
      <Box x={620} y={346} w={146} h={32} title={t("dg.night.report")} dashed />
    </Frame>
  );
}

/** Agent (mdt_ token) → proxy (holds the key) → model provider; anything else from the sandbox is refused. */
function KeysDiagram({ t }: { t: T }) {
  return (
    <Frame id="keys" name="keys" t={t} view="0 0 772 230" minW={600}>
      <rect x={6} y={10} width={210} height={210} rx={14} className="fill-canvas stroke-line-strong" strokeWidth={1.5} strokeDasharray="5 5" />
      <Box x={26} y={40} w={170} h={70} title={t("dg.keys.agent")} />
      <Arrow id="keys" d="M200 75 h86" />
      <Label x={204} y={44} w={86} h={28}>{t("dg.keys.token")}</Label>
      <Box x={292} y={30} w={200} h={90} title={t("dg.keys.proxy")} note={t("dg.keys.proxyNote")} tone="info" />
      <Arrow id="keys" d="M496 75 h70" />
      <Label x={496} y={44} w={70} h={28}>{t("dg.keys.key")}</Label>
      <Box x={572} y={40} w={194} h={70} title={t("dg.keys.provider")} dashed />
      <path d="M111 114 V160" className="stroke-bad fill-none" strokeWidth={1.5} strokeDasharray="4 5" />
      <path d="M104 132 l14 14 M118 132 l-14 14" className="stroke-bad" strokeWidth={2.5} />
      <Label x={22} y={164} w={190} h={44} className="text-bad">{t("dg.keys.blocked")}</Label>
    </Frame>
  );
}

export function Diagram({ name, t }: { name: DiagramName; t: T }) {
  if (name === "flow") return <FlowDiagram t={t} />;
  if (name === "permissions") return <PermissionsDiagram t={t} />;
  if (name === "night") return <NightDiagram t={t} />;
  return <KeysDiagram t={t} />;
}
