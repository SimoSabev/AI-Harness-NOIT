import path from "node:path";
import { MandatError } from "@mandat/contract";
import type { SqlClient } from "@mandat/ledger";
import { buildFixture, seedMinimal } from "@mandat/worker";
import os from "node:os";
import { mkdtempSync } from "node:fs";
import { OBSERVER_APP_ID, WRITER_APP_ID, checkLine, deleteM, demoRepoWithPull, editFile, externalPrVerdict, fakeGitHub } from "@mandat/gate-github";
import { dockerText, ensureUpstreamNetwork, imageTags, probeIpv6 } from "@mandat/sandbox";
import type { DockerRunner } from "@mandat/sandbox";
import { hostConfig, infraUserFor } from "@mandat/verify";
import { printJson } from "../output.js";
import type { Io } from "../output.js";
import { repoRoot } from "../paths.js";

/** т. 5.1: `mandat demo seed --minimal` (demo org + owner + repo shop on the demo-shop mirror). */
export async function demoSeed(io: Io, o: { home: string; minimal: boolean; json: boolean; db: SqlClient & { end?: () => Promise<void> } }): Promise<number> {
  if (!o.minimal) throw new MandatError("E_USAGE", "only --minimal exists in E1б (the full seed is E3а)");
  const fx = buildFixture({ repoRoot, mandatHome: o.home, force: false, name: "demo-shop" });
  try {
    const r = await seedMinimal(o.db, { remoteUrl: `file://${path.resolve(fx.mirror)}` });
    if (o.json) printJson(io, { ...r, base_commit: fx.sha, exit: 0 });
    else io.stdout(`demo org ${r.org}${r.created ? "" : " (already seeded)"} · owner ${r.owner} · repo mandat-demo/shop @ ${fx.sha.slice(0, 12)}\n`);
    return 0;
  } catch (e) {
    io.stderr(`demo seed: ${(e as Error).message.split("\n")[0] ?? ""}\n`);
    return 3;
  } finally {
    await o.db.end?.();
  }
}

/**
 * т. 6 „Готово, когато“: `mandat demo external-pr --fake` — an outside PR („octo-agent“) deletes test M, CI (fake) is green;
 * prints the check run Mandat would post. fakeGitHub + the real sandbox; nothing leaves the machine.
 */
export async function demoExternalPr(io: Io, o: { home: string; fake: boolean; json: boolean; docker: DockerRunner }): Promise<number> {
  if (!o.fake) throw new MandatError("E_USAGE", "only --fake exists (the live path is the worker with the GitHub Apps)");
  const images = await imageTags(repoRoot);
  for (const t of [images.sandbox, images.gate]) {
    if ((await dockerText(o.docker, ["image", "inspect", t])).exitCode !== 0) {
      io.stderr(`E_IMAGES_MISSING: ${t}; пусни pnpm mandat images build\n`);
      return 3;
    }
  }
  await ensureUpstreamNetwork(o.docker);
  const g = demoRepoWithPull((w) => editFile(w, "tests/cart.spec.ts", deleteM));
  const repo = "mandat-demo/shop";
  const gh = fakeGitHub({ repos: { [repo]: { gitPath: g.bare, head: g.base } }, pulls: [{ repo, pull: { number: 1, head_sha: g.head, base_sha: g.base, head_ref: "octo/fix", author_login: "octo-agent", author_id: 4242, author_association: "COLLABORATOR" } }] });
  gh.addCheck(repo, { name: "test", head_sha: g.head, external_id: "ci", conclusion: "success", app_id: 15368, title: "ci", summary: "" });
  const host = hostConfig(io.env);
  const r = await externalPrVerdict({
    gh, repo, number: 1, remoteUrl: `file://${g.bare}`, defaultBranch: "main", writerAppId: WRITER_APP_ID, ownAppIds: [WRITER_APP_ID, OBSERVER_APP_ID], known: [],
    queue: { activeGlobal: 0, activeForPull: 0, startedLastHourForRepo: 0 },
    verify: {
      docker: o.docker, images, infraUser: (await infraUserFor(o.docker).catch(() => ({ user: "1000:1000" }))).user, ipv6Sysctl: await probeIpv6(o.docker, images.sandbox),
      mandatHome: mkdtempSync(path.join(os.tmpdir(), "mandat-demo-ext-")), home: os.homedir(), ...(host.extraCa ? { extraCa: host.extraCa } : {}),
      progress: (l) => io.stderr(l + "\n"),
    },
    postCheck: async (rp, c) => void (await gh.createOrUpdateCheckRun(rp, c)),
  });
  if (r.kind !== "verdict") {
    io.stderr(`demo external-pr: ${r.kind}\n`);
    return 3;
  }
  if (o.json) printJson(io, { check: r.check, effective_level: r.outcome.effective_level, exit: 0 });
  else io.stdout(`${checkLine(r.outcome.verdict)}\n${r.check.title}\nниво: ${r.outcome.effective_level}\n`);
  return 0;
}
