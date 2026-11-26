import path from "node:path";
import { LANG_IMAGES, dockerText, imageTags, langImageTag, uiImageTag } from "@mandat/sandbox";
import type { ImageLanguage } from "@mandat/sandbox";
import type { HostConfig } from "@mandat/worker";
import type { CliDeps } from "../deps.js";
import type { Io } from "../output.js";
import { repoRoot } from "../paths.js";

/** D-053 / D-099: one line per image, "<tag> built" or "<tag> exists". Exit 0 / 3. `ui` (D-364) adds the D12 browser image. */
export async function imagesBuild(io: Io, deps: CliDeps, o: { force: boolean; host: HostConfig; ui?: boolean; langs?: string[] }): Promise<number> {
  // D-687: the language images (python, go, rust) on top of the exact sandbox tag, after it
  const langs = (o.langs ?? []).flatMap((x) => x.split(",")).map((x) => x.trim()).filter((x) => x !== "");
  const unknown = langs.find((x) => !(x in LANG_IMAGES));
  if (unknown !== undefined) {
    io.stderr(`unknown language: ${unknown} (python, go, rust)\n`);
    return 2;
  }
  const tags = await imageTags(repoRoot);
  const list: [string, string, string][] = [
    ["sandbox", tags.sandbox, "docker/sandbox/Dockerfile"],
    ["gate", tags.gate, "docker/egress-gate/Dockerfile"],
    ["proxy", tags.proxy, "docker/llm-proxy/Dockerfile"],
  ];
  if (o.ui === true) list.push(["ui", await uiImageTag(repoRoot), "docker/sandbox-ui/Dockerfile"]);
  for (const l of [...new Set(langs)] as ImageLanguage[]) list.push([`lang:${l}`, langImageTag(repoRoot, l, tags.sandbox), `docker/${LANG_IMAGES[l].dir}/Dockerfile`]);
  for (const [kind, tag, file] of list) {
    const exists = (await dockerText(deps.docker, ["image", "inspect", tag])).exitCode === 0;
    if (exists && !o.force) {
      io.stdout(`${tag} exists\n`);
      continue;
    }
    const args = ["build", "-t", tag, "-f", path.join(repoRoot, file)];
    if (o.force) args.push("--no-cache");
    if (kind === "sandbox" && !o.host.sandboxApt) args.push("--build-arg", "SANDBOX_APT=0");
    if (kind.startsWith("lang:")) args.push("--build-arg", `SANDBOX=${tags.sandbox}`);
    if (o.host.extraCa !== undefined) args.push("--secret", `id=extra_ca,src=${o.host.extraCa}`);
    args.push(repoRoot);
    const res = await deps.docker.run(args, { env: {}, stdin: "closed", timeoutMs: 1_800_000, onStderr: (c) => io.stderr(c.toString("utf8")) });
    if (res.exitCode !== 0 || res.timedOut) {
      io.stderr(`build failed: ${tag}\n`);
      return 3;
    }
    io.stdout(`${tag} built\n`);
  }
  return 0;
}
