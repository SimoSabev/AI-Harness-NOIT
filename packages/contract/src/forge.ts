import { z } from "zod";

// E9f (D-660): a push to a forge (GitHub or GitLab), as the revert observer needs it. Only the commit ids and messages are
// kept; the messages are untrusted text (anyone with push rights writes them) and are never shown or logged.
export const MESSAGE_MAX = 65_536;
/** GitHub's push payload holds at most 2048 commits (docs, checked 26.11.2026); a longer list is not a GitHub push. */
export const PUSH_COMMITS_MAX = 2048;

const Sha40 = z.string().regex(/^[0-9a-f]{40}$/);
const RepoPath = z.string().regex(/^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+){1,20}$/).refine((s) => !s.split("/").some((p) => p === "." || p === ".."), "dot segment");
const Commit = z.object({ id: Sha40, message: z.string().transform((m) => m.slice(0, MESSAGE_MAX)) });
const Common = { ref: z.string().max(300), before: Sha40, after: Sha40, commits: z.array(Commit).max(PUSH_COMMITS_MAX) };
const GitHubPush = z.object({ ...Common, deleted: z.boolean().optional(), repository: z.object({ full_name: RepoPath }) });
const GitLabPush = z.object({ ...Common, object_kind: z.literal("push"), project: z.object({ path_with_namespace: RepoPath }) });

export const ForgePushSchema = z.object({
  forge: z.enum(["github", "gitlab"]),
  repo: RepoPath,
  branch: z.string().min(1).max(250),
  after: Sha40,
  commits: z.array(z.object({ sha: Sha40, message: z.string().max(MESSAGE_MAX) })).max(PUSH_COMMITS_MAX),
});
export type ForgePush = z.infer<typeof ForgePushSchema>;

const NULL_SHA = "0".repeat(40);
const branchOf = (ref: string): string | null => {
  const m = /^refs\/heads\/(.+)$/.exec(ref);
  return m?.[1] ?? null;
};

/** A GitHub `push` webhook → ForgePush; a tag, a deleted branch or a malformed payload → null. */
export function pushFromGitHub(payload: unknown): ForgePush | null {
  const r = GitHubPush.safeParse(payload);
  if (!r.success || r.data.deleted === true || r.data.after === NULL_SHA) return null;
  const branch = branchOf(r.data.ref);
  if (!branch) return null;
  return { forge: "github", repo: r.data.repository.full_name, branch, after: r.data.after, commits: r.data.commits.map((c) => ({ sha: c.id, message: c.message })) };
}

/** A GitLab „Push Hook“ → ForgePush (same rules) [НП: payload fields from the webhook docs, not seen live]. */
export function pushFromGitLab(payload: unknown): ForgePush | null {
  const r = GitLabPush.safeParse(payload);
  if (!r.success || r.data.after === NULL_SHA) return null;
  const branch = branchOf(r.data.ref);
  if (!branch) return null;
  return { forge: "gitlab", repo: r.data.project.path_with_namespace, branch, after: r.data.after, commits: r.data.commits.map((c) => ({ sha: c.id, message: c.message })) };
}
