import path from "node:path";
import { dockerText, imageTags, uiImageTag } from "@mandat/sandbox";
import type { HostConfig } from "@mandat/worker";
import type { CliDeps } from "../deps.js";
import type { Io } from "../output.js";
import { repoRoot } from "../paths.js";

/** D-053 / D-099: one line per image, "<tag> built" or "<tag> exists". Exit 0 / 3. `ui` (D-364) adds the D12 browser image. */
export async function imagesBuild(io: Io, deps: CliDeps, o: { force: boolean; host: HostConfig; ui?: boolean }): Promise<number> {
  const tags = await imageTags(repoRoot);
  const list: [string, string, string][] = [
    ["sandbox", tags.sandbox, "docker/sandbox/Dockerfile"],
    ["gate", tags.gate, "docker/egress-gate/Dockerfile"],
    ["proxy", tags.proxy, "docker/llm-proxy/Dockerfile"],
  ];
  if (o.ui === true) list.push(["ui", await uiImageTag(repoRoot), "docker/sandbox-ui/Dockerfile"]);
  for (const [kind, tag, file] of list) {
    const exists = (await dockerText(deps.docker, ["image", "inspect", tag])).exitCode === 0;
    if (exists && !o.force) {
      io.stdout(`${tag} exists\n`);
      continue;
    }
    const args = ["build", "-t", tag, "-f", path.join(repoRoot, file)];
    if (o.force) args.push("--no-cache");
    if (kind === "sandbox" && !o.host.sandboxApt) args.push("--build-arg", "SANDBOX_APT=0");
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
