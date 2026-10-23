"use client";
import { useState } from "react";
import { useT } from "../i18n/client";
import type { DiffFile } from "../lib/diff-view";
import { addedContent } from "../lib/markdown";
import { Markdown } from "./markdown";

// What the agent wrote, readable: a new Markdown file is shown as a document, any other new file as text, a changed
// file as its change (the full file after the change is not stored, only the diff).
const LINE: Record<string, string> = { add: "bg-ok-soft text-ok", del: "bg-bad-soft text-bad", hunk: "text-info", ctx: "text-mute" };
const isMd = (p: string) => /\.(md|mdx|markdown)$/i.test(p);

export function FileViewer({ files, start = 0, tall = false }: { files: DiffFile[]; start?: number; tall?: boolean }) {
  const t = useT();
  const [sel, setSel] = useState(Math.min(Math.max(0, start), Math.max(0, files.length - 1)));
  const f = files[sel];
  const content = f ? addedContent(f) : null;
  const [mode, setMode] = useState<"view" | "diff">(content !== null ? "view" : "diff");
  if (!f) return null;
  const pick = (i: number) => {
    setSel(i);
    const x = files[i];
    setMode(x && addedContent(x) !== null ? "view" : "diff");
  };
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-raised/50 px-2 py-1.5">
        {files.map((x, i) => (
          <button key={`${x.path}-${i}`} type="button" onClick={() => pick(i)} aria-pressed={i === sel}
            className="max-w-full truncate rounded-md px-2 py-1 font-mono text-xs text-mute transition hover:text-ink aria-pressed:bg-panel aria-pressed:text-ink">
            <span className={x.kind === "added" ? "text-ok" : x.kind === "deleted" ? "text-bad" : "text-warn"}>{x.kind === "added" ? "+" : x.kind === "deleted" ? "−" : "~"}</span> {x.path}
          </button>
        ))}
        {content !== null && (
          <div role="group" aria-label={f.path} className="ml-auto flex gap-1">
            {(["view", "diff"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                className="rounded-md px-2 py-1 text-xs text-mute hover:text-ink aria-pressed:bg-accent-soft aria-pressed:text-accent-text">
                {t(m === "view" ? "res.preview" : "res.change")}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={`overflow-auto ${tall ? "max-h-[calc(100vh-14rem)]" : "max-h-[32rem]"}`}>
        {mode === "view" && content !== null ? (
          isMd(f.path) ? <Markdown src={content} className="px-6 py-5 text-[15px]" /> : <pre className="px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{content}</pre>
        ) : (
          <pre className="py-2 font-mono text-xs leading-relaxed">
            {f.lines.map((l, k) => <div key={k} className={`px-4 whitespace-pre-wrap ${LINE[l.kind] ?? ""}`}>{l.text || " "}</div>)}
          </pre>
        )}
      </div>
      <p className="border-t border-line px-4 py-2 text-xs text-mute">
        {t(`diff.kind.${f.kind}`)} · <span className="text-ok">+{f.added}</span> <span className="text-bad">−{f.removed}</span>
        {content === null && f.kind !== "deleted" && <> · {t("res.noPreview")}</>}
      </p>
    </div>
  );
}
