import type { T } from "../i18n/t";

// E9g B (D-377): the flow of a task, drawn with the theme tokens (Tailwind fill-/stroke- classes), so it follows the
// dark and the light theme. Step 7 adds the detailed diagrams of /docs.
export function FlowDiagram({ t }: { t: T }) {
  const steps = [t("flow.task"), t("flow.sandbox"), t("flow.export"), t("flow.verdict")];
  const w = 150;
  const gap = 34;
  return (
    <figure className="overflow-x-auto">
      <svg viewBox="0 0 720 200" className="min-w-[560px] w-full" role="img" aria-labelledby="flow-title flow-desc">
        <title id="flow-title">{t("home.flowTitle")}</title>
        <desc id="flow-desc">{t("home.flowAlt")}</desc>
        {steps.map((s, i) => {
          const x = 8 + i * (w + gap);
          return (
            <g key={s}>
              <rect x={x} y={24} width={w} height={64} rx={12} className={i === 3 ? "fill-accent-soft stroke-accent" : "fill-panel stroke-line-strong"} strokeWidth={1.5} />
              <text x={x + w / 2} y={61} textAnchor="middle" className="fill-ink font-display text-[14px]">{s}</text>
              {i < steps.length - 1 && <path d={`M${x + w + 4} 56 h${gap - 10}`} className="stroke-mute" strokeWidth={1.5} markerEnd="url(#arrow)" />}
              <path d={`M${x + w / 2} 92 V136`} className="stroke-line-strong" strokeWidth={1.5} strokeDasharray="2 6" />
            </g>
          );
        })}
        <rect x={8} y={140} width={4 * w + 3 * gap} height={44} rx={12} className="fill-raised stroke-line-strong" strokeWidth={1.5} />
        <text x={8 + (4 * w + 3 * gap) / 2} y={167} textAnchor="middle" className="fill-mute font-display text-[14px]">{t("flow.ledger")}</text>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className="fill-mute" />
          </marker>
        </defs>
      </svg>
    </figure>
  );
}
