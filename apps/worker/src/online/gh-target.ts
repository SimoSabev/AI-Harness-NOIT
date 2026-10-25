import type { GitHubPort } from "@mandat/gate-github";

// D-388: the worker used one GitHub repo (`ghRepo`, the demo) for every project. Now each project goes to its own:
// a GitHub project to its repo; the demo repo as before (fake offline, the Writer App online); a local project added on
// this computer to the offline GitHub only (`localGh`), never to a real one — its delivery is Mandat's mirror.
export interface GhDeps {
  gh: GitHubPort;
  ghRepo: string;
  /** the offline GitHub for local projects (fakeGitHub with autoRepos); without it `gh` */
  localGh?: GitHubPort;
}

export function ghFor(d: GhDeps, r: { provider: string; full_name: string }): { gh: GitHubPort; repo: string; own: boolean } {
  const own = r.provider === "local" && r.full_name !== d.ghRepo;
  return { gh: own ? (d.localGh ?? d.gh) : d.gh, repo: r.full_name, own };
}
