import path from "node:path";

/** D-025: "<file relative to the tree root> > <ancestorTitles joined with ' > '> > <title>". */
export function testIdOf(fileAbs: string, workRoot: string, ancestors: string[], title: string): string {
  const rel = path.posix.relative(workRoot, fileAbs);
  return [rel, ...ancestors, title].join(" > ");
}
