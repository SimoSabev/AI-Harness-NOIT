import { verdictView } from "../lib/verdict-view";

// WCAG 1.4.1: sign + word + colour, never colour alone.
export function Verdict({ result }: { result: string | null }) {
  const v = verdictView(result);
  return (
    <span className={`verdict ${v.tone}`}>
      <span aria-hidden="true">{v.sign}</span> {v.word}
    </span>
  );
}
