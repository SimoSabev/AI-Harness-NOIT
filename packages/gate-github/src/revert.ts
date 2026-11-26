import type { ForgePush } from "@mandat/contract";

// E9f (v5 5.6, AC-9.5, D-660): the Observer sees a push to the default branch and asks which pushed commit reverts a change
// Mandat merged in the last 7 days. Two signals, both from the commit message (the only thing a push carries):
//   reverts_commit — the body line `git revert` writes: „This reverts commit <sha>.“ with the merge commit's sha
//                    (git 2.54.0, checked locally 26.11.2026; git-revert docs);
//   revert_pr      — GitHub's Revert button: a PR „Revert "<title>"“ whose body is „Reverts <owner>/<repo>#<n>“ [НП: the
//                    docs do not give the text; seen in GitHub's UI], squashed into one commit; or the subject alone
//                    „Revert "<title>"“ / „Revert "<title> (#n)"“ with Mandat's exact PR title.
// The window is measured from the merge to the moment the push is SEEN, never by the commit's own date (the author sets it).
export const REVERT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface MergedChange {
  changeset_id: string;
  merge_sha: string;
  pr_number: number | null;
  /** Mandat's PR title (prTitle), null when unknown */
  title: string | null;
  merged_at: string;
}
export interface RevertMatch {
  changeset_id: string;
  revert_sha: string;
  signal: "reverts_commit" | "revert_pr";
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** strong: names this very change (the merge sha, or „Reverts <repo>#<n>“, or the title with its own (#n)); weak: the title alone. */
function strengthOf(message: string, m: MergedChange, repo: string): { signal: RevertMatch["signal"]; strong: boolean } | null {
  const lines = message.split(/\r?\n/).map((l) => l.trim());
  if (lines.some((l) => l === `This reverts commit ${m.merge_sha}.` || l === `This reverts commit ${m.merge_sha}`)) return { signal: "reverts_commit", strong: true };
  const subject = lines[0] ?? "";
  if (!subject.startsWith('Revert "') || subject.startsWith('Revert "Revert ')) return null;
  if (m.pr_number !== null && lines.some((l) => new RegExp(`^Reverts ${escapeRe(repo)}#${m.pr_number}$`).test(l))) return { signal: "revert_pr", strong: true };
  if (!m.title) return null;
  if (m.pr_number !== null && new RegExp(`^Revert "${escapeRe(m.title)} \\(#${m.pr_number}\\)"( \\(#\\d+\\))?$`).test(subject)) return { signal: "revert_pr", strong: true };
  if (new RegExp(`^Revert "${escapeRe(m.title)}"( \\(#\\d+\\))?$`).test(subject)) return { signal: "revert_pr", strong: false };
  return null;
}

export function findReverts(push: ForgePush, merged: readonly MergedChange[], o: { now: Date; defaultBranch: string; repo: string }): RevertMatch[] {
  if (push.branch !== o.defaultBranch || push.repo !== o.repo) return [];
  const t = o.now.getTime();
  const open = merged.filter((m) => {
    const at = Date.parse(m.merged_at);
    return Number.isFinite(at) && at <= t && t - at <= REVERT_WINDOW_MS;
  });
  const out: RevertMatch[] = [];
  const taken = new Set<string>();
  for (const c of push.commits) {
    const hits = open.filter((m) => m.merge_sha !== c.sha && !taken.has(m.changeset_id)).flatMap((m) => {
      const s = strengthOf(c.message, m, o.repo);
      return s ? [{ m, ...s }] : [];
    });
    const strong = hits.filter((h) => h.strong);
    // the title alone names a change only when exactly one open change has it (two merges with the same title → none)
    const chosen = strong.length > 0 ? strong : hits.length === 1 ? hits : [];
    for (const h of chosen) {
      taken.add(h.m.changeset_id);
      out.push({ changeset_id: h.m.changeset_id, revert_sha: c.sha, signal: h.signal });
    }
  }
  return out;
}
