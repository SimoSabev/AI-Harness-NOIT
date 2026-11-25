import type { T } from "../i18n/t";

// E9g B (D-377), D-608: the path of a task — four stops on one strap, the verdict in the accent, the ledger under all of
// them. Drawn with the theme tokens (fill-/stroke- classes), so it follows the dark and the light theme.
export function FlowDiagram({ t }: { t: T }) {
  const steps = [t("flow.task"), t("flow.sandbox"), t("flow.export"), t("flow.verdict")];
  const w = 150;
  const gap = 34;
  const total = 4 * w + 3 * gap;
  return (
    <figure className="overflow-x-auto">
      <svg viewBox="0 0 720 200" className="w-full min-w-[560px]" role="img" aria-labelledby="flow-title flow-desc">
        <title id="flow-title">{t("home.flowTitle")}</title>
        <desc id="flow-desc">{t("home.flowAlt")}</desc>
        <rect x={8 + w / 2} y={53} width={total - w} height={6} rx={3} className="fill-line-strong" />
        {steps.map((s, i) => {
          const x = 8 + i * (w + gap);
          const verdict = i === 3;
          return (
            <g key={s}>
              <rect x={x} y={24} width={w} height={64} rx={10} className={verdict ? "fill-accent-soft stroke-accent" : "fill-panel stroke-line-strong"} strokeWidth={1.5} />
              <circle cx={x + 18} cy={56} r={5} className={verdict ? "fill-accent" : "fill-line-strong"} />
              <text x={x + w / 2 + 8} y={61} textAnchor="middle" className="fill-ink text-[14px] font-medium">{s}</text>
              <path d={`M${x + w / 2} 92 V136`} className="stroke-line-strong" strokeWidth={1.5} strokeDasharray="2 6" />
            </g>
          );
        })}
        <rect x={8} y={140} width={total} height={44} rx={10} className="fill-raised stroke-line" strokeWidth={1} />
        <text x={8 + total / 2} y={167} textAnchor="middle" className="fill-mute text-[14px]">{t("flow.ledger")}</text>
      </svg>
    </figure>
  );
}
