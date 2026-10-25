import type { VerdictResult } from "@mandat/contract";

// D-367 (Симо, 23.10.2026: „питай ме само ако е абсолютно нужно“): when a verified change goes in by itself. Pure.
// Mandat already said VERIFIED (tests, scope, protected paths, secrets); this adds what a person must still see:
// deleted/renamed files, the places that change how the project builds, runs or is trusted, and big changes.
export const AUTO_APPLY_LIMITS = { lines: 300, files: 15 } as const;

const SENSITIVE: { cls: string; re: RegExp }[] = [
  { cls: "deps", re: /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|yarn\.lock|bun\.lockb?|npm-shrinkwrap\.json|requirements[^/]*\.txt|pyproject\.toml|poetry\.lock|Pipfile(\.lock)?|uv\.lock|Cargo\.(toml|lock)|go\.(mod|sum)|Gemfile(\.lock)?|composer\.(json|lock))$/ },
  { cls: "ci", re: /(^|\/)(\.github|\.circleci|\.buildkite|deploy|infra)\/|(^|\/)(\.gitlab-ci\.yml|Jenkinsfile|azure-pipelines\.yml|Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml)$|\.tf$/ },
  { cls: "harness", re: /(^|\/)(\.mandat\.ya?ml|AGENTS\.md|CLAUDE(\.local)?\.md|\.mcp\.json)$|(^|\/)(\.claude|\.codex|\.cursor|\.mandat)\// },
  { cls: "secrets", re: /(^|\/)(\.env(\.[^/]*)?|\.npmrc|\.yarnrc(\.yml)?|\.pypirc|\.netrc|id_(rsa|ed25519|ecdsa)[^/]*)$|\.(pem|key|p12|pfx|jks|keystore)$|(^|\/)secrets?\// },
  { cls: "hooks", re: /(^|\/)(\.husky|\.githooks|\.git-hooks)\/|(^|\/)\.pre-commit-config\.yaml$/ },
  { cls: "migrations", re: /(^|\/)migrations?\// },
];
const MAX_PATHS = 10;

export interface AutoApplyInput {
  result: VerdictResult;
  /** "external": a PR/agent outside Mandat's sandbox (D-207) never goes in by itself */
  origin: "mandat" | "external";
  files: { path: string; kind: "added" | "modified" | "deleted" | "renamed"; added: number; removed: number }[];
}
export type AutoApplyWhy = string;

/** A git patch → per file: path, kind, +/− lines (hunk lines only; a "+++"/"---" inside a hunk is content). */
export function diffStat(patch: string): AutoApplyInput["files"] {
  const out: AutoApplyInput["files"] = [];
  let cur: AutoApplyInput["files"][number] | null = null;
  let inHunk = false;
  for (const l of patch.split("\n")) {
    const head = /^diff --git a\/(.+) b\/(.+)$/.exec(l);
    if (head) {
      cur = { path: head[2] ?? "", kind: head[1] !== head[2] ? "renamed" : "modified", added: 0, removed: 0 };
      out.push(cur);
      inHunk = false;
      continue;
    }
    if (!cur) continue;
    if (l.startsWith("@@")) inHunk = true;
    else if (!inHunk && l.startsWith("new file mode")) cur.kind = "added";
    else if (!inHunk && l.startsWith("deleted file mode")) cur.kind = "deleted";
    else if (inHunk && l.startsWith("+")) cur.added++;
    else if (inHunk && l.startsWith("-")) cur.removed++;
  }
  return out;
}

/** {auto: true} = apply without asking; otherwise every reason a person is asked (codes for the UI and the ledger). */
export function autoApply(i: AutoApplyInput): { auto: boolean; why: AutoApplyWhy[] } {
  const why: string[] = [];
  if (i.result !== "VERIFIED") why.push("not_verified");
  if (i.origin !== "mandat") why.push("external");
  if (i.files.length === 0) why.push("empty");
  let paths = 0;
  const path = (w: string) => {
    if (paths++ < MAX_PATHS && !why.includes(w)) why.push(w);
  };
  for (const f of i.files) if (f.kind === "deleted" || f.kind === "renamed") path(`${f.kind}:${f.path}`);
  for (const f of i.files) {
    const s = SENSITIVE.find((x) => x.re.test(f.path));
    if (s) path(`sensitive:${s.cls}:${f.path}`);
  }
  const lines = i.files.reduce((n, f) => n + f.added + f.removed, 0);
  if (lines > AUTO_APPLY_LIMITS.lines) why.push(`too_big:${lines}`);
  if (i.files.length > AUTO_APPLY_LIMITS.files) why.push(`too_many_files:${i.files.length}`);
  return { auto: why.length === 0, why };
}
