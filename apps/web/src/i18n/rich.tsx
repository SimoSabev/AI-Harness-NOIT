import { Fragment } from "react";

// E7f: a whole translated sentence with React parts in it (`{cmd}` → <code>…</code>), so translators see one sentence.
export function rich(text: string, parts: Record<string, React.ReactNode>): React.ReactNode {
  return text.split(/(\{\w+\})/g).map((piece, i) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1];
    return <Fragment key={i}>{name !== undefined && name in parts ? parts[name] : piece}</Fragment>;
  });
}
