/**
 * D-447: there is nothing to verify when the export has zero changed files and the contract demands no test. A rule of
 * facts: the export counts the files, the contract was sealed before the agent ran; what the agent says or how it exits
 * has no way in. A deletion is a changed file. A skipped check is never VERIFIED (the worker records UNKNOWN EXPORT:empty_change).
 */
export function nothingToCheck(o: { changedFiles: number; mustPass: readonly string[] }): boolean {
  return o.changedFiles === 0 && o.mustPass.length === 0;
}
