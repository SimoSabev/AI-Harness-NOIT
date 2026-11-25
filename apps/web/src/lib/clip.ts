// D-599: a text short enough for one line (Nova's ribbon, the answering line of a conversation).
const MAX = 42;
export function clip(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > MAX ? `${one.slice(0, MAX).trimEnd()}…` : one;
}
