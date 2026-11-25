import type { ChatTurn } from "@mandat/contract";
import type { T } from "../i18n/t";
import { profileOf } from "../lib/project-profile";

// D-599: the brief of the project beside the interview, written live: a ring of how much is known, and one tile per
// part — dashed while unknown, landing with an accent flash when a note writes it, tagged "from the code" (cobalt) or
// "from you" (accent).
export function ProjectProfile({ turns, t }: { turns: readonly ChatTurn[]; t: T }) {
  const p = profileOf(turns);
  const of = p.tiles.length;
  const c = 2 * Math.PI * 18;
  return (
    <aside aria-label={t("interview.brief")} className="flex min-h-0 flex-col gap-3 overflow-y-auto lg:w-[22rem] lg:shrink-0">
      <div className="flex items-center gap-3">
        <svg viewBox="0 0 44 44" className="size-11 shrink-0" role="img" aria-label={t("interview.filled", { n: p.filled, of })}>
          <circle cx="22" cy="22" r="18" fill="none" stroke="var(--line)" strokeWidth="4" />
          <circle cx="22" cy="22" r="18" fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(c * p.filled) / of} ${c}`} transform="rotate(-90 22 22)" className="transition-[stroke-dasharray] duration-500" />
          <text x="22" y="26" textAnchor="middle" className="fill-ink font-mono text-[11px]">{p.filled}/{of}</text>
        </svg>
        <div>
          <p className="text-sm font-semibold">{t("interview.brief")}</p>
          <p className="text-xs text-mute">
            {t("interview.briefHint")} <span className="text-info">◆ {t("interview.fromCode")}</span> <span className="text-accent-text">◆ {t("interview.fromYou")}</span>
          </p>
        </div>
      </div>
      <ul className="grid gap-2">
        {p.tiles.map((x) => (
          <li key={x.part} className={x.value === null ? "rounded-[10px] border border-dashed border-line-strong px-3 py-2.5" : `rounded-[10px] border bg-canvas px-3 py-2.5 ${x.fresh ? "land border-accent" : "border-line"}`}>
            <p className="text-xs font-medium flex items-center justify-between gap-2 text-mute">
              {t(x.label)}
              {x.from && <span className={x.from === "code" ? "text-info" : "text-accent-text"}>{t(x.from === "code" ? "interview.fromCode" : "interview.fromYou")}</span>}
            </p>
            <p className={`mt-1 whitespace-pre-wrap text-sm ${x.value === null ? "text-faint" : ""} ${x.part === "commands" ? "font-mono text-xs" : ""}`}>{x.value ?? t("interview.empty")}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
