import { appendFileSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { explain } from "@mandat/contract";
import { cleanGit } from "@mandat/export";
import { mandatVerify } from "./cli.js";
import type { VerifyCliDeps } from "./cli.js";
import { REF_NAME } from "./trusted-base.js";

// The GitHub Action of mandat-verify (action.yml at the repo root runs dist/action-main.js on a pull_request job).
// Trust: the workflow's own actions/checkout made the .git, so origin/<base> is GitHub's base branch, not the PR's; it is
// copied into a bare repo outside the workspace and named as the remote (no token ever reaches Mandat).

export type FailOn = "FAILED" | "UNKNOWN";
export type ActionInputs =
  | { ok: true; workspace: string; baseRef: string; temp: string; failOn: FailOn; args: string[] }
  | { ok: false; error: string };
type Env = Record<string, string | undefined>;

const list = (v: string | undefined): string[] => (v ?? "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

export function actionInputs(env: Env): ActionInputs {
  const workspace = env.GITHUB_WORKSPACE ?? "";
  const baseRef = env.GITHUB_BASE_REF ?? "";
  const temp = env.RUNNER_TEMP ?? "";
  if (!baseRef) return { ok: false, error: "no base branch: run this action on a pull_request event (GITHUB_BASE_REF is empty)" };
  if (!REF_NAME.test(baseRef)) return { ok: false, error: `bad base branch name: ${baseRef}` };
  if (!workspace || !temp) return { ok: false, error: "GITHUB_WORKSPACE and RUNNER_TEMP are required" };
  const f = (env.INPUT_FAIL_ON ?? "FAILED").trim().toUpperCase();
  if (f !== "FAILED" && f !== "UNKNOWN") return { ok: false, error: `fail-on must be FAILED or UNKNOWN, not ${f}` };
  const args = ["--external", "--json"];
  const type = env.INPUT_TYPE?.trim();
  if (type) args.push("--type", type);
  if (env.INPUT_LINT?.trim()) args.push("--lint", env.INPUT_LINT.trim());
  if (env.INPUT_TYPECHECK?.trim()) args.push("--typecheck", env.INPUT_TYPECHECK.trim());
  for (const p of list(env.INPUT_UI_PATHS)) args.push("--ui-paths", p);
  if (env.INPUT_DEV?.trim()) args.push("--dev", env.INPUT_DEV.trim());
  for (const r of list(env.INPUT_UI_ROUTES)) args.push("--ui-route", r);
  return { ok: true, workspace, baseRef, temp, failOn: f, args };
}

/** origin/<base> (as actions/checkout fetched it) → a bare repo with only that branch, HEAD on it; its file:// URL. */
export async function prepareBase(o: { workspace: string; baseRef: string; temp: string }): Promise<{ ok: true; remote: string } | { ok: false; error: string }> {
  const dir = path.join(o.temp, "mandat-base.git");
  const tmpHome = path.join(o.temp, "mandat-git-home");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(tmpHome, { recursive: true });
  const git = cleanGit({ tmpHome });
  const ok = async (args: string[], cwd: string) => (await git.run(args, { cwd })).code === 0;
  if (!(await ok(["init", "-q", "--bare", dir], o.temp))) return { ok: false, error: "git init failed" };
  const into = `refs/heads/${o.baseRef}`;
  const fetched =
    (await ok(["fetch", "-q", "--no-tags", "--end-of-options", o.workspace, `+refs/remotes/origin/${o.baseRef}:${into}`], dir)) ||
    (await ok(["fetch", "-q", "--no-tags", "--end-of-options", o.workspace, `+${into}:${into}`], dir));
  if (!fetched) return { ok: false, error: `origin/${o.baseRef} is not in the checkout: use actions/checkout with fetch-depth: 0` };
  if (!(await ok(["symbolic-ref", "HEAD", into], dir))) return { ok: false, error: "cannot point HEAD at the base branch" };
  return { ok: true, remote: `file://${dir}` };
}

export interface ActionOutcome {
  verdict: { run_id: string; result: "VERIFIED" | "UNKNOWN" | "FAILED"; reasons: string[]; evidence: { detector: string; status: string; summary: string }[] };
  effective_level: number;
  level_reasons: string[];
}

const words = (reason: string): string =>
  (explain({ result: "-", reasons: [reason], lang: "en" }).split("\n")[1] ?? reason).replace(/<untrusted[^>]*>([\s\S]*?)<\/untrusted>/g, (_m, id: string) => `«${id.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")}»`);
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 200);
const ICON = { VERIFIED: "✅", UNKNOWN: "🟡", FAILED: "❌" } as const;

export function renderSummary(o: ActionOutcome): string {
  const v = o.verdict;
  const lines = [`## Mandat: ${v.result} ${ICON[v.result]}`, "", `Level ${o.effective_level} · run \`${v.run_id}\``, ""];
  if (v.reasons.length > 0) {
    lines.push("### Why", "");
    for (const r of v.reasons) lines.push(`- \`${cell(r)}\` — ${words(r)}`);
    lines.push("");
  }
  lines.push("### Checks", "", "| Check | Status | Summary |", "| --- | --- | --- |");
  for (const e of v.evidence.filter((x) => x.status !== "n/a")) lines.push(`| ${e.detector} | ${e.status} | ${cell(e.summary)} |`);
  return lines.join("\n") + "\n";
}

export const outputsOf = (o: ActionOutcome): string[] => [`result=${o.verdict.result}`, `level=${o.effective_level}`, `reasons=${JSON.stringify(o.verdict.reasons)}`];

/** GitHub workflow commands: the message escapes %, CR and LF (https://docs.github.com/actions/reference/workflow-commands). */
const esc = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
export function annotations(o: ActionOutcome): string[] {
  const r = o.verdict.result;
  if (r === "VERIFIED") return [`::notice title=Mandat VERIFIED::the change is verified`];
  const kind = r === "FAILED" ? "error" : "warning";
  return o.verdict.reasons.slice(0, 10).map((x) => `::${kind} title=Mandat ${r}::${esc(x)}`);
}

/** 0 green, 1 red by fail-on, 2 the check could not run. */
export function actionExit(result: ActionOutcome["verdict"]["result"] | null, failOn: FailOn): 0 | 1 | 2 {
  if (result === null) return 2;
  if (result === "FAILED") return 1;
  return result === "UNKNOWN" && failOn === "UNKNOWN" ? 1 : 0;
}

export async function runAction(env: Env, io: { stdout: (s: string) => void; stderr: (s: string) => void }, deps: VerifyCliDeps = {}): Promise<number> {
  const summary = (s: string) => env.GITHUB_STEP_SUMMARY && appendFileSync(env.GITHUB_STEP_SUMMARY, s);
  const notRun = (why: string): number => {
    summary(`## Mandat: not run\n\n${why}\n`);
    io.stdout(`::error title=Mandat not run::${esc(why)}\n`);
    return 2;
  };
  const inp = actionInputs(env);
  if (!inp.ok) return notRun(inp.error);
  const base = await prepareBase(inp);
  if (!base.ok) return notRun(base.error);
  let out = "";
  const home = env.MANDAT_HOME ?? path.join(inp.temp, "mandat-home");
  await mandatVerify(["--repo", inp.workspace, "--remote", base.remote, "--home", home, ...inp.args], { stdout: (s) => (out += s), stderr: io.stderr, env, cwd: inp.workspace }, deps);
  const parse = (line: string): unknown => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  };
  const parsed = parse(out.trim().split("\n").at(-1) ?? "null");
  if (parsed === null || typeof parsed !== "object") return notRun("mandat-verify gave no result");
  const err = (parsed as { error?: { code: string; message: string } }).error;
  if (err) return notRun(`${err.code}: ${err.message}`);
  const o = parsed as ActionOutcome;
  summary(renderSummary(o));
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, outputsOf(o).join("\n") + "\n");
  for (const a of annotations(o)) io.stdout(a + "\n");
  return actionExit(o.verdict.result, inp.failOn);
}
