import type { T } from "../i18n/t";
import type { DiffFile } from "../lib/diff-view";
import { isTestPath } from "../lib/diff-view";
import { card } from "./ui";


const LINE: Record<string, string> = {
  add: "bg-ok-soft text-ok",
  del: "bg-bad-soft text-bad",
  hunk: "text-info",
  ctx: "text-mute",
};

// D-299: the change per file — a summary row per file first (+/−, "deleted", "test"), then the lines, folded when many.
export function DiffView({ files, t }: { files: DiffFile[]; t: T }) {
  const added = files.reduce((n, f) => n + f.added, 0);
  const removed = files.reduce((n, f) => n + f.removed, 0);
  return (
    <div className="space-y-3">
      <p className="text-sm text-mute">
        {t.n("diff.files", files.length)} · <span className="text-ok">+{added}</span> <span className="text-bad">−{removed}</span>
      </p>
      {files.map((f, i) => {
        const test = isTestPath(f.path);
        return (
          <details key={`${f.path}-${i}`} open={files.length <= 4} className={`${card} overflow-hidden`}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono">{f.path}</span>
              {test && <span className={`rounded px-1.5 py-0.5 text-xs ${f.kind === "deleted" ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn"}`}>{t("diff.test")}</span>}
              <span className="text-xs text-mute">{t(`diff.kind.${f.kind}`)}</span>
              <span className="font-mono text-xs"><span className="text-ok">+{f.added}</span> <span className="text-bad">−{f.removed}</span></span>
            </summary>
            <pre className="overflow-x-auto border-t border-line font-mono text-xs leading-5">
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
