import { spawn, spawnSync } from "node:child_process";
import { z } from "zod";
import { buildProfileArgs, dockerText, ensureUpstreamNetwork, imageTags, profileVolume } from "@mandat/sandbox";
import type { CliDeps } from "../deps.js";
import { printJson } from "../output.js";
import type { Io } from "../output.js";
import { repoRoot } from "../paths.js";
import type { LoginCli, LoginDeps, LoginProc } from "./login-session.js";

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

/** D-393: `codex login status` [НП: the wording] — „Logged in using ChatGPT“ on success; the plan is not shown. */
export function parseCodexStatus(stdout: string, exitCode: number): ProfileStatus {
  return exitCode === 0 && /logged in using chatgpt/i.test(stdout) ? { loggedIn: true, email: null, plan: "ChatGPT" } : { loggedIn: false, email: null, plan: null };
}

const PREFIX = { claude: "mandat-profile-claude-", codex: "mandat-profile-codex-" } as const;

export interface Account extends ProfileStatus { name: string; agent: string; cli: LoginCli }

export async function listAccounts(deps: CliDeps): Promise<Account[]> {
  const r = await dockerText(deps.docker, ["volume", "ls", "--filter", "label=mandat.profile=1", "--format", "{{.Name}}"]);
  if (r.exitCode !== 0) return [];
  const image = (await imageTags(repoRoot)).sandbox;
  const out: Account[] = [];
  for (const vol of r.stdout.split("\n").map((x) => x.trim())) {
    const cli = (["claude", "codex"] as const).find((c) => vol.startsWith(PREFIX[c]));
    if (!cli) continue;
    const name = vol.slice(PREFIX[cli].length);
    const s = await dockerText(deps.docker, buildProfileArgs("status", { image, volume: vol }), 60_000);
    out.push({ name, agent: `${cli}@${name}`, cli, ...(cli === "codex" ? parseCodexStatus(s.stdout, s.exitCode) : parseClaudeStatus(s.stdout)) });
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

/** Image present, upstream network, the profile volume created and owned by the agent user (terminal and web login). */
export async function prepareProfile(deps: CliDeps, name: string, cli: LoginCli = "claude"): Promise<{ ok: true; image: string; volume: string; created: boolean } | { ok: false; reason: "images_missing" | "failed"; image: string }> {
  const volume = profileVolume(cli, name);
  const image = (await imageTags(repoRoot)).sandbox;
  if ((await dockerText(deps.docker, ["image", "inspect", image])).exitCode !== 0) return { ok: false, reason: "images_missing", image };
  await ensureUpstreamNetwork(deps.docker);
  const created = (await dockerText(deps.docker, ["volume", "inspect", volume])).exitCode !== 0;
  if ((await dockerText(deps.docker, ["volume", "create", "--label", "mandat.profile=1", volume])).exitCode !== 0) return { ok: false, reason: "failed", image };
  if ((await dockerText(deps.docker, buildProfileArgs("init", { image, volume }), 60_000)).exitCode !== 0) return { ok: false, reason: "failed", image };
  return { ok: true, image, volume, created };
}

async function profileStatus(deps: CliDeps, name: string, cli: LoginCli = "claude"): Promise<ProfileStatus> {
  const image = (await imageTags(repoRoot)).sandbox;
  const r = await dockerText(deps.docker, buildProfileArgs("status", { image, volume: profileVolume(cli, name) }), 60_000);
  return cli === "codex" ? parseCodexStatus(r.stdout, r.exitCode) : parseClaudeStatus(r.stdout);
}

/** D-369: the real process behind a web login — `docker run -i` with pipes; nothing it prints is logged here. */
export function loginDeps(deps: CliDeps): LoginDeps {
  let image = "";
  return {
    prepare: async (name, cli) => {
      const p = await prepareProfile(deps, name, cli);
      image = p.image;
      return p.ok ? (p.created ? "created" : "ok") : p.reason;
    },
    discard: async (name, cli) => void (await dockerText(deps.docker, ["volume", "rm", profileVolume(cli, name)], 60_000)),
    spawn: (name, cli): LoginProc => {
      const child = spawn("docker", buildProfileArgs("login-web", { image, volume: profileVolume(cli, name) }), { stdio: ["pipe", "pipe", "pipe"] });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdin.on("error", () => undefined);
      return {
        onOutput: (f) => {
          child.stdout.on("data", f);
          child.stderr.on("data", f);
        },
        onExit: (f) => void child.on("close", (code) => f(code)),
        write: (s) => void child.stdin.write(s),
        kill: () => void child.kill("SIGTERM"),
      };
    },
    status: (name, cli) => profileStatus(deps, name, cli),
    timeoutMs: 10 * 60_000,
  };
}

/** Interactive: needs the user's terminal (the browser flow prints a URL and asks for the code). */
export async function loginCommand(io: Io, deps: CliDeps, o: { name: string }): Promise<number> {
  const p = await prepareProfile(deps, o.name);
  if (!p.ok) {
    if (p.reason === "images_missing") io.stderr(`E_IMAGES_MISSING: ${p.image}; пусни pnpm mandat images build\n`);
    return 3;
  }
  io.stderr(`Акаунт „${o.name}“: стартирам Claude Code. Отвори адреса, който ще покаже, влез в claude.ai и постави кода тук.\n`);
  const r = spawnSync("docker", buildProfileArgs("login", { image: p.image, volume: p.volume }), { stdio: "inherit" });
  if (r.status !== 0) return 3;
  const s = await profileStatus(deps, o.name);
  io.stdout(s.loggedIn ? `Готово: ${s.email ?? o.name} · ${s.plan ?? "абонамент"} → агент claude@${o.name}\n` : "Входът не завърши.\n");
  return s.loggedIn ? 0 : 3;
}

/** Signs the account out and removes its profile volume (terminal and web). */
export async function logoutProfile(deps: CliDeps, name: string, cli: LoginCli = "claude"): Promise<boolean> {
  const vol = profileVolume(cli, name);
  const image = (await imageTags(repoRoot)).sandbox;
  await dockerText(deps.docker, buildProfileArgs("logout", { image, volume: vol }), 60_000);
  return (await dockerText(deps.docker, ["volume", "rm", vol], 60_000)).exitCode === 0;
}

export async function logoutCommand(io: Io, deps: CliDeps, o: { name: string }): Promise<number> {
  const ok = await logoutProfile(deps, o.name);
  io.stdout(ok ? `Акаунт „${o.name}“ е махнат.\n` : `Няма акаунт „${o.name}“.\n`);
  return ok ? 0 : 3;
}
