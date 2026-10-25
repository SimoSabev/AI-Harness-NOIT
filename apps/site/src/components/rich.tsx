import { Fragment } from "react";

// E9g B step 7 (D-378): catalog text with `code` in backticks → <code>; everything else stays plain text (React escapes it).
export function Rich({ text }: { text: string }) {
  const parts = text.split(/`([^`]+)`/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded bg-raised px-1 py-0.5 font-mono text-[0.9em] text-ink">
            {p}
          </code>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}
