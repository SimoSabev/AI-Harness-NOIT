import type { T } from "../i18n/t";

// D-599: the hidden oracle as a grid of cells, one per criterion — red on the base is the proof the oracle can fail
// (coral), a criterion already green on the base is amber (the oracle does not test it yet).
export function OracleGrid({ cells, t }: { cells: { criterion_id: string; red: boolean }[]; t: T }) {
  return (
    <ul aria-label={t("chat.oracle.onBase")} className="mt-2 flex flex-wrap gap-1.5">
      {cells.map((c) => (
        <li key={c.criterion_id} title={`${c.criterion_id} · ${t(c.red ? "chat.oracle.red" : "chat.oracle.green")}`}
          className={`flex h-6 min-w-11 items-center justify-center rounded-[3px] border px-1 font-mono text-[10px] ${c.red ? "border-bad bg-bad-soft text-bad" : "border-warn bg-warn-soft text-warn"}`}>
          <span className="sr-only">{t(c.red ? "chat.oracle.red" : "chat.oracle.green")} · </span>{c.criterion_id}
        </li>
      ))}
    </ul>
  );
}
