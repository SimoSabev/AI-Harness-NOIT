import { inline, parseMarkdown } from "../lib/markdown";
import type { Block } from "../lib/markdown";

// The agent's Markdown as React elements (lib/markdown): never HTML, so a document cannot run anything in the page.
function Inl({ src }: { src: string }) {
  return (
    <>
      {inline(src).map((p, k) => {
        if (p.kind === "strong") return <strong key={k} className="font-semibold">{p.text}</strong>;
        if (p.kind === "em") return <em key={k}>{p.text}</em>;
        if (p.kind === "code") return <code key={k} className="rounded bg-raised px-1 py-0.5 font-mono text-[0.9em]">{p.text}</code>;
        if (p.kind === "link") return <a key={k} href={p.href} target="_blank" rel="noreferrer noopener" className="text-accent-text underline">{p.text}</a>;
        return p.text.split("\n").map((s, i) => (i === 0 ? <span key={`${k}-${i}`}>{s}</span> : <span key={`${k}-${i}`}><br />{s}</span>));
      })}
    </>
  );
}

const H = ["text-2xl", "text-xl", "text-lg", "text-base", "text-sm", "text-sm"];

function B({ b }: { b: Block }) {
  switch (b.kind) {
    case "heading": {
      const cls = `font-display font-semibold tracking-tight ${H[b.level - 1] ?? "text-base"} ${b.level <= 2 ? "mt-6" : "mt-4"} first:mt-0`;
      return b.level === 1 ? <h2 className={cls}><Inl src={b.text} /></h2> : b.level === 2 ? <h3 className={cls}><Inl src={b.text} /></h3> : <h4 className={cls}><Inl src={b.text} /></h4>;
    }
    case "para":
      return <p className="leading-relaxed"><Inl src={b.text} /></p>;
    case "hr":
      return <hr className="border-line" />;
    case "quote":
      return <blockquote className="border-l-2 border-accent-text/50 pl-4 text-mute"><Inl src={b.text} /></blockquote>;
    case "code":
      return <pre className="overflow-x-auto rounded-lg bg-raised p-3 font-mono text-xs leading-relaxed">{b.text}</pre>;
    case "list": {
      const items = b.items.map((it, k) => <li key={k} style={{ marginLeft: `${it.depth * 1.25}rem` }}><Inl src={it.text} /></li>);
      return b.ordered ? <ol className="list-decimal space-y-1 pl-6">{items}</ol> : <ul className="list-disc space-y-1 pl-6">{items}</ul>;
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-raised text-left">
              <tr>{b.head.map((c, k) => <th key={k} className="border-b border-line px-3 py-2 font-medium"><Inl src={c} /></th>)}</tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => <tr key={i} className="border-b border-line last:border-0">{r.map((c, k) => <td key={k} className="px-3 py-2 align-top"><Inl src={c} /></td>)}</tr>)}
            </tbody>
          </table>
        </div>
      );
  }
}

export function Markdown({ src, className = "" }: { src: string; className?: string }) {
  return <div className={`space-y-3 ${className}`}>{parseMarkdown(src).map((b, k) => <B key={k} b={b} />)}</div>;
}
