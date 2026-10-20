import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dockerText, ensureUpstreamNetwork, imageTags, probeIpv6, realDockerRunner } from "@mandat/sandbox";
import { hostConfig, infraUserFor } from "@mandat/verify";
import { externalPrVerdict } from "./external.js";
import { OBSERVER_APP_ID, WRITER_APP_ID, fakeGitHub } from "./fake.js";
import { M, deleteM, demoRepoWithPull, editFile, repoRoot } from "./demo-repo.js";
import type { CheckRunInput } from "./port.js";

// Демо промпт т. 6 external-pr: PR from „octo-agent“ deletes test M; CI (fake) = success → „Мандат verdict“ failure.
async function env() {
  const docker = realDockerRunner();
  const images = await imageTags(repoRoot);
  for (const t of [images.sandbox, images.gate]) if ((await dockerText(docker, ["image", "inspect", t])).exitCode !== 0) throw new Error(`image missing: ${t}`);
  await ensureUpstreamNetwork(docker);
  const host = hostConfig(process.env);
  return { docker, images, infraUser: (await infraUserFor(docker)).user, ipv6Sysctl: await probeIpv6(docker, images.sandbox), ...(host.extraCa ? { extraCa: host.extraCa } : {}), home: os.homedir() };
}

describe("external PR (docker)", () => {
  it("изтрит тест M + зелен CI → failure; D7.ci pass и D2:missing_test:<M>; ниво ≤ 1; без merge/ready", async () => {
    const g = demoRepoWithPull((w) => editFile(w, "tests/cart.spec.ts", deleteM));
    const gh = fakeGitHub({ repos: { "mandat-demo/shop": { gitPath: g.bare, head: g.base } }, pulls: [{ repo: "mandat-demo/shop", pull: { number: 1, head_sha: g.head, base_sha: g.base, head_ref: "octo/fix", author_login: "octo-agent", author_id: 4242, author_association: "COLLABORATOR" } }] });
    gh.addCheck("mandat-demo/shop", { name: "test", head_sha: g.head, external_id: "ci", conclusion: "success", app_id: 15368, title: "ci", summary: "" });
    const posted: CheckRunInput[] = [];
    const r = await externalPrVerdict({
      gh, repo: "mandat-demo/shop", number: 1, remoteUrl: `file://${g.bare}`, defaultBranch: "main", writerAppId: WRITER_APP_ID, ownAppIds: [WRITER_APP_ID, OBSERVER_APP_ID],
      known: [], queue: { activeGlobal: 0, activeForPull: 0, startedLastHourForRepo: 0 },
      verify: { ...(await env()), mandatHome: mkdtempSync(path.join(os.tmpdir(), "mandat-ext-home-")) },
      postCheck: async (repo, c) => {
        posted.push(c);
        await gh.createOrUpdateCheckRun(repo, c);
      },
    });
    expect(r.kind).toBe("verdict");
    if (r.kind !== "verdict") return;
    expect(r.check.conclusion).toBe("failure");
    expect(r.check.summary).toMatch(/\| D7\.ci \| pass \|/);
    expect(r.check.summary).toContain(`D2:missing_test:${M}`);
    expect(r.outcome.effective_level).toBeLessThanOrEqual(1);
    expect(r.check.external_id).toBe(`ext:mandat-demo/shop#1@${g.head.slice(0, 12)}`);
    expect(gh.state.calls.filter((c) => /^(merge|ready|createPull|createRef)/.test(c))).toEqual([]);
    expect(posted).toHaveLength(1);
  });
});
