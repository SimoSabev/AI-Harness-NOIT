import { spawnSync } from "node:child_process";
import { z } from "zod";
import { buildProfileArgs, dockerText, ensureUpstreamNetwork, imageTags, profileVolume } from "@mandat/sandbox";
import type { CliDeps } from "../deps.js";
import { printJson } from "../output.js";
import type { Io } from "../output.js";
import { repoRoot } from "../paths.js";

// D-295: subscription accounts, like T3 Code: the user signs in to the unmodified Claude Code through Anthropic's own
// flow, one profile volume per account. The harness reads only `claude auth status` (who, which plan), never a token.

/**
 * The plan label of `subscriptionType`. Adapted from T3 Code (apps/server/src/provider/ClaudeProvider.ts,
 * claudeSubscriptionLabel), Copyright (c) 2026 T3 Tools Inc., MIT License — see NOTICE.
 */
export function subscriptionLabel(subscriptionType: string | undefined): string | null {
  const n = subscriptionType?.toLowerCase().replace(/[\s_-]+/g, "");
  if (!n) return null;
  const known: Record<string, string> = {
    claudemaxsubscription: "Max", claudemax5xsubscription: "Max 5x", claudemax20xsubscription: "Max 20x",
    claudeenterprisesubscription: "Enterprise", claudeteamsubscription: "Team", claudeprosubscription: "Pro", claudefreesubscription: "Free",
    max: "Max", maxplan: "Max", max5: "Max 5x", max20: "Max 20x", enterprise: "Enterprise", team: "Team", pro: "Pro", free: "Free",
  };
  return known[n] ?? (subscriptionType ?? "").split(/[\s_-]+/g).filter(Boolean).map((p) => p[0]?.toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

const Status = z.object({ loggedIn: z.boolean(), email: z.string().max(320).optional(), subscriptionType: z.string().max(100).optional() }).passthrough();
export interface ProfileStatus { loggedIn: boolean; email: string | null; plan: string | null }

export function parseClaudeStatus(stdout: string): ProfileStatus {
  let j: unknown;
  try {
    j = JSON.parse(stdout.trim());
  } catch {
    j = null;
  }
  const s = Status.safeParse(j);
  if (!s.success || !s.data.loggedIn) return { loggedIn: false, email: null, plan: null };
  return { loggedIn: true, email: s.data.email ?? null, plan: subscriptionLabel(s.data.subscriptionType) };
}

const PREFIX = "mandat-profile-claude-";

export interface Account extends ProfileStatus { name: string; agent: string }

export async function listAccounts(deps: CliDeps): Promise<Account[]> {
  const r = await dockerText(deps.docker, ["volume", "ls", "--filter", "label=mandat.profile=1", "--format", "{{.Name}}"]);
  if (r.exitCode !== 0) return [];
  const image = (await imageTags(repoRoot)).sandbox;
  const out: Account[] = [];
  for (const vol of r.stdout.split("\n").map((x) => x.trim()).filter((x) => x.startsWith(PREFIX))) {
    const name = vol.slice(PREFIX.length);
    const s = await dockerText(deps.docker, buildProfileArgs("status", { image, volume: vol }), 60_000);
    out.push({ name, agent: `claude@${name}`, ...parseClaudeStatus(s.stdout) });
  }
  return out;
}

export async function accountsCommand(io: Io, deps: CliDeps, o: { json: boolean }): Promise<number> {
  const list = await listAccounts(deps);
  if (o.json) printJson(io, { accounts: list });
  else if (list.length === 0) io.stdout("Няма акаунти. Влез с: pnpm mandat login --name <име>\n");
  else for (const a of list) io.stdout(`${a.name.padEnd(16)} ${a.loggedIn ? `${a.email ?? "?"} · ${a.plan ?? "абонамент"}` : "не е влязъл"}\n`);
  return 0;
}

/** Interactive: needs the user's terminal (the browser flow prints a URL and asks for the code). */
export async function loginCommand(io: Io, deps: CliDeps, o: { name: string }): Promise<number> {
  const vol = profileVolume("claude", o.name);
  const image = (await imageTags(repoRoot)).sandbox;
  if ((await dockerText(deps.docker, ["image", "inspect", image])).exitCode !== 0) {
    io.stderr(`E_IMAGES_MISSING: ${image}; пусни pnpm mandat images build\n`);
    return 3;
  }
  await ensureUpstreamNetwork(deps.docker);
  if ((await dockerText(deps.docker, ["volume", "create", "--label", "mandat.profile=1", vol])).exitCode !== 0) return 3;
  if ((await dockerText(deps.docker, buildProfileArgs("init", { image, volume: vol }), 60_000)).exitCode !== 0) return 3;
  io.stderr(`Акаунт „${o.name}“: стартирам Claude Code. Отвори адреса, който ще покаже, влез в claude.ai и постави кода тук.\n`);
  const r = spawnSync("docker", buildProfileArgs("login", { image, volume: vol }), { stdio: "inherit" });
  if (r.status !== 0) return 3;
  const s = parseClaudeStatus((await dockerText(deps.docker, buildProfileArgs("status", { image, volume: vol }), 60_000)).stdout);
  io.stdout(s.loggedIn ? `Готово: ${s.email ?? o.name} · ${s.plan ?? "абонамент"} → агент claude@${o.name}\n` : "Входът не завърши.\n");
  return s.loggedIn ? 0 : 3;
}

export async function logoutCommand(io: Io, deps: CliDeps, o: { name: string }): Promise<number> {
  const vol = profileVolume("claude", o.name);
  const image = (await imageTags(repoRoot)).sandbox;
  await dockerText(deps.docker, buildProfileArgs("logout", { image, volume: vol }), 60_000);
  const rm = await dockerText(deps.docker, ["volume", "rm", vol], 60_000);
  io.stdout(rm.exitCode === 0 ? `Акаунт „${o.name}“ е махнат.\n` : `Няма акаунт „${o.name}“.\n`);
  return rm.exitCode === 0 ? 0 : 3;
}
