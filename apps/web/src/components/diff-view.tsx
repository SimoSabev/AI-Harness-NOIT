import type { DiffFile } from "../lib/diff-view";
import { isTestPath } from "../lib/diff-view";
import { card } from "./ui";

const KIND: Record<DiffFile["kind"], string> = { added: "нов", modified: "променен", deleted: "изтрит", renamed: "преименуван" };
const LINE: Record<string, string> = {
  add: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
  del: "bg-red-50 text-red-900 dark:bg-red-950/60 dark:text-red-300",
  hunk: "text-sky-700 dark:text-sky-400",
  ctx: "text-zinc-600 dark:text-zinc-400",
};

// D-299: the change per file — a summary row per file first (+/−, „изтрит“, „тест“), then the lines, folded when many.
export function DiffView({ files }: { files: DiffFile[] }) {
  const added = files.reduce((n, f) => n + f.added, 0);
  const removed = files.reduce((n, f) => n + f.removed, 0);
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {files.length} {files.length === 1 ? "файл" : "файла"} · <span className="text-emerald-700 dark:text-emerald-400">+{added}</span> <span className="text-red-700 dark:text-red-400">−{removed}</span>
      </p>
      {files.map((f, i) => {
        const test = isTestPath(f.path);
        return (
          <details key={`${f.path}-${i}`} open={files.length <= 4} className={`${card} overflow-hidden`}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono">{f.path}</span>
              {test && <span className={`rounded px-1.5 py-0.5 text-xs ${f.kind === "deleted" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>тест</span>}
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{KIND[f.kind]}</span>
              <span className="font-mono text-xs"><span className="text-emerald-700 dark:text-emerald-400">+{f.added}</span> <span className="text-red-700 dark:text-red-400">−{f.removed}</span></span>
            </summary>
            <pre className="overflow-x-auto border-t border-zinc-200 font-mono text-xs leading-5 dark:border-zinc-800">
              <code className="block py-2">
                {f.lines.map((l, k) => (
                  <span key={k} className={`block px-4 ${LINE[l.kind]}`}>{l.text || " "}</span>
                ))}
              </code>
            </pre>
          </details>
        );
      })}
    </div>
  );
}
