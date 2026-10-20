import path from "node:path";
import { MandatError } from "@mandat/contract";

export type RunRole = "seed" | "install" | "agent" | "export" | "test" | "gate";
export interface MountSpec {
  kind: "volume" | "bind";
  source: string;
  target: string;
  readonly: boolean;
}
export interface RunSpec {
  role: RunRole;
  runId: string;
  image: string;
  network: "none" | string;
  user: "1000:1000" | "0:0" | `${number}:${number}`;
  mounts: MountSpec[];
  /** ONLY names of secrets ⊆ SECRET_ENV_NAMES → `-e NAME`; the value comes from the docker CLI env (D-043, D-105). */
  envNames: string[];
  /** Public values → `-e NAME=value` in argv; never a secret name (D-105). */
  publicEnv: Record<string, string>;
  workdir?: string;
  name?: string;
  interactive?: boolean;
  init?: boolean;
  detach?: boolean;
  /** Only role "gate" (D-034); D-096 widens this only if the S3(д) fallback is activated. */
  capAdd?: "NET_BIND_SERVICE"[];
  /** D-150: optional ro CA bundle for gate containers in TLS-intercepting environments. */
  caFile?: string;
  /** D-152: false only when the Docker host kernel has no IPv6 (then there is nothing to disable). Default true. */
  ipv6Sysctl?: boolean;
}

export const SECRET_ENV_NAMES = ["ANTHROPIC_API_KEY", "AWS_SECRET_ACCESS_KEY", "OPENAI_API_KEY"] as const;
const SECRETS: ReadonlySet<string> = new Set(SECRET_ENV_NAMES);

/** 8.2 template: every sandbox container (seed/install/agent/export/test) gets exactly these flags. */
export const SANDBOX_HARDENING: readonly string[] = [
  "--cap-drop=ALL",
  "--security-opt=no-new-privileges",
  "--read-only",
  "--tmpfs",
  "/tmp:rw,exec,nosuid,nodev,size=512m",
  "--tmpfs",
  "/home/agent:rw,exec,nosuid,nodev,size=1g,uid=1000,gid=1000,mode=0700",
  "--pids-limit=512",
  "--memory=2g",
  "--memory-swap=2g",
  "--cpus=2",
  "--ulimit",
  "nofile=4096:4096",
  "--ipc=private",
  "--sysctl",
  "net.ipv6.conf.all.disable_ipv6=1",
  "--stop-timeout=30",
  "--log-driver=none",
  "--label",
  "mandat.run=<run_id>",
  "--label",
  "mandat.role=<role>",
];

/** Gate: the same flags, but no sysctl, --pids-limit=128 and --memory=256m (8.2). */
const GATE_HARDENING: readonly string[] = (() => {
  const out: string[] = [];
  for (let i = 0; i < SANDBOX_HARDENING.length; i++) {
    const f = SANDBOX_HARDENING[i] as string;
    if (f === "--sysctl") {
      i++;
      continue;
    }
    if (f === "--pids-limit=512") out.push("--pids-limit=128");
    else if (f === "--memory=2g") out.push("--memory=256m");
    else if (f === "--memory-swap=2g") out.push("--memory-swap=256m");
    else out.push(f);
  }
  return out;
})();

export function sandboxHardening(runId: string, role: RunRole, o: { ipv6Sysctl?: boolean } = {}): string[] {
  const tpl = role === "gate" ? GATE_HARDENING : SANDBOX_HARDENING;
  const out = tpl.map((f) => f.replace("<run_id>", runId).replace("<role>", role));
  if (o.ipv6Sysctl === false) {
    const i = out.indexOf("--sysctl");
    if (i >= 0) out.splice(i, 2);
  }
  return out;
}

const forbid = (msg: string, details?: Record<string, unknown>): never => {
  throw new MandatError("E_FORBIDDEN_DOCKER_FLAG", msg, details);
};

const SPEC_KEYS = new Set([
  "role", "runId", "image", "network", "user", "mounts", "envNames", "publicEnv",
  "workdir", "name", "interactive", "init", "detach", "capAdd", "caFile", "ipv6Sysctl",
]);
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SECRET_LOOKING = /mdt_|sk-ant-/;

function checkEnv(envNames: string[], publicEnv: Record<string, string>): void {
  for (const n of envNames) {
    if (!SECRETS.has(n)) forbid(`envNames may only contain secret names (${SECRET_ENV_NAMES.join(", ")})`, { name: n });
  }
  for (const [k, v] of Object.entries(publicEnv)) {
    if (!ENV_NAME.test(k)) forbid("invalid env name", { name: k });
    if (SECRETS.has(k)) forbid("a secret name must never carry a value in argv (D-043)", { name: k });
    if (SECRET_LOOKING.test(v)) forbid("publicEnv value looks like a secret", { name: k });
  }
}

const isAncestorOrSame = (a: string, b: string): boolean => {
  const rel = path.relative(a, b);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

function checkBind(m: MountSpec, role: RunRole, ctx: { home: string; mandatHome: string; runDir: string }, caFile?: string): void {
  const src = path.resolve(m.source);
  if (!path.isAbsolute(m.source)) forbid("bind source must be absolute", { source: m.source });
  if (src.includes("docker.sock") || m.target.includes("docker.sock")) forbid("docker.sock mount is forbidden");
  if (isAncestorOrSame(src, path.resolve(ctx.home))) forbid("bind source is $HOME or its ancestor (D-066)", { source: src });
  const runDir = path.resolve(ctx.runDir);
  if (role === "gate") {
    const x = "(?:/(?:base|a|b))?";
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const roPolicy = new RegExp(`^${esc(runDir)}/gate${x}/policy$`);
    const rwLog = new RegExp(`^${esc(runDir)}/gate${x}/log$`);
    const npmCache = path.join(path.resolve(ctx.mandatHome), "cache", "npm");
    const ok =
      (m.readonly && roPolicy.test(src)) ||
      (!m.readonly && rwLog.test(src)) ||
      (!m.readonly && src === npmCache) ||
      (m.readonly && caFile !== undefined && src === path.resolve(caFile));
    if (!ok) forbid("bind mount not allowed for role gate (D-118)", { source: src, readonly: m.readonly });
    return;
  }
  if (!m.readonly) forbid("rw bind mounts are forbidden in the sandbox (D-066)", { source: src });
  const allowed = new RegExp(`^${runDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/etc(?:/(?:base|a|b))?/(?:resolv\\.conf|hosts)$`);
  if (!allowed.test(src)) forbid("only ro files under ${runDir}/etc/ may be bind-mounted (D-066, D-081)", { source: src });
}

/**
 * Builds `docker run` arguments up to and including the image (the caller appends the command).
 * Throws E_FORBIDDEN_DOCKER_FLAG for anything outside 8.2; never contains secret values (D-043).
 */
export function buildRunArgs(spec: RunSpec, ctx: { home: string; mandatHome: string; runDir: string }): string[] {
  for (const k of Object.keys(spec)) if (!SPEC_KEYS.has(k)) forbid(`unknown docker option: ${k}`);
  const runs = path.join(path.resolve(ctx.mandatHome), "runs") + path.sep;
  if (!path.isAbsolute(ctx.runDir) || !path.resolve(ctx.runDir).startsWith(runs)) {
    forbid("runDir must be an absolute path under <MANDAT_HOME>/runs/ (D-082)", { runDir: ctx.runDir });
  }
  if (spec.image.startsWith("-") || spec.image.length === 0) forbid("invalid image");
  if (spec.network === "host" || spec.network.startsWith("container:") || spec.network.startsWith("-")) {
    forbid("network host/container is forbidden", { network: spec.network });
  }
  if (spec.role === "gate") {
    if (spec.capAdd && spec.capAdd.some((c) => c !== "NET_BIND_SERVICE")) forbid("gate may only add NET_BIND_SERVICE");
  } else {
    if (spec.capAdd && spec.capAdd.length > 0) forbid("--cap-add is forbidden in the sandbox");
    if (spec.caFile !== undefined) forbid("caFile is only for the gate");
    const okUser = spec.user === "1000:1000" || (spec.role === "seed" && spec.user === "0:0");
    if (!okUser) forbid("the sandbox always runs as 1000:1000 (seed of contract.txt: 0:0)", { user: spec.user });
  }
  if (!/^\d+:\d+$/.test(spec.user)) forbid("invalid user");
  checkEnv(spec.envNames, spec.publicEnv);

  const args = ["run"];
  args.push(spec.detach ? "-d" : "--rm");
  if (spec.interactive) args.push("-i");
  if (spec.init) args.push("--init");
  if (spec.name !== undefined) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(spec.name)) forbid("invalid container name");
    args.push("--name", spec.name);
  }
  args.push(...sandboxHardening(spec.runId, spec.role, spec.ipv6Sysctl === undefined ? {} : { ipv6Sysctl: spec.ipv6Sysctl }));
  for (const c of spec.capAdd ?? []) args.push(`--cap-add=${c}`);
  args.push("--user", spec.user, "--network", spec.network);
  for (const m of spec.mounts) {
    if (m.kind === "volume") {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(m.source)) forbid("invalid volume name", { source: m.source });
    } else {
      checkBind(m, spec.role, ctx, spec.caFile);
    }
    if (!m.target.startsWith("/")) forbid("mount target must be absolute");
    args.push("-v", `${m.kind === "bind" ? path.resolve(m.source) : m.source}:${m.target}${m.readonly ? ":ro" : ""}`);
  }
  for (const [k, v] of Object.entries(spec.publicEnv)) args.push("-e", `${k}=${v}`);
  for (const n of spec.envNames) args.push("-e", n);
  if (spec.workdir !== undefined) args.push("-w", spec.workdir);
  args.push(spec.image);
  return args;
}

export interface ProxyRunOptions {
  name: "mandat-llm-proxy" | `mandat-llm-proxy-test-${string}` | `mandat-test-stub-${string}`;
  image: string;
  user: string;
  mandatHome: string;
  publishAdminPort: number | null;
  envNames: string[];
  publicEnv: Record<string, string>;
  command?: string[];
  /** D-150: optional ro CA bundle (TLS-intercepting environments). */
  caFile?: string;
}

/** 8.1 / D-083: the proxy, the test proxy and the stub. Only `-p 127.0.0.1:<port>:8788` may be published. */
export function buildProxyRunArgs(o: ProxyRunOptions): string[] {
  const keys = new Set(["name", "image", "user", "mandatHome", "publishAdminPort", "envNames", "publicEnv", "command", "caFile"]);
  for (const k of Object.keys(o)) if (!keys.has(k)) forbid(`unknown docker option: ${k}`);
  if (!/^(mandat-llm-proxy|mandat-llm-proxy-test-[a-z0-9-]+|mandat-test-stub-[a-z0-9-]+)$/.test(o.name)) forbid("invalid proxy name");
  if (!/^\d+:\d+$/.test(o.user)) forbid("invalid user");
  if (o.image.startsWith("-")) forbid("invalid image");
  checkEnv(o.envNames, o.publicEnv);
  const args = ["run", "-d", "--name", o.name];
  if (o.name === "mandat-llm-proxy") args.push("--restart", "unless-stopped");
  args.push(
    "--network", "mandat-upstream",
    "--user", o.user,
    "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges",
    "--pids-limit=256", "--memory=512m",
    "--tmpfs", "/tmp:rw,nosuid,nodev,size=64m",
    "--log-driver=json-file", "--log-opt", "max-size=10m",
    "--label", "mandat.proxy=1",
  );
  for (const [k, v] of Object.entries(o.publicEnv)) args.push("-e", `${k}=${v}`);
  for (const n of o.envNames) args.push("-e", n);
  args.push("-v", `${path.join(path.resolve(o.mandatHome), "proxy")}:/var/lib/mandat-proxy`);
  if (o.caFile !== undefined) args.push("-v", `${path.resolve(o.caFile)}:/etc/mandat-ca.pem:ro`);
  if (o.publishAdminPort !== null) {
    if (!Number.isInteger(o.publishAdminPort) || o.publishAdminPort < 1 || o.publishAdminPort > 65535) forbid("invalid port");
    args.push("-p", `127.0.0.1:${o.publishAdminPort}:8788`);
  }
  args.push(o.image, ...(o.command ?? []));
  for (const a of o.command ?? []) if (/--privileged|docker\.sock/.test(a)) forbid("forbidden token in command");
  return args;
}

const BASE_PUBLIC = { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/home/agent", LANG: "C.UTF-8", CI: "true" };

/** 8.2: exact env sets per phase. names = secrets only (→ RunSpec.envNames); publicValues → RunSpec.publicEnv. */
export function envForPhase(
  phase: "install" | "agent" | "test",
  o: { tokenName?: "ANTHROPIC_API_KEY" | "OPENAI_API_KEY"; testsEnv?: Record<string, string> } = {},
): { names: string[]; publicValues: Record<string, string> } {
  if (phase === "install") {
    return {
      names: [],
      publicValues: {
        ...BASE_PUBLIC,
        NPM_CONFIG_REGISTRY: "http://egress-gate/npm/",
        npm_config_replace_registry_host: "npmjs",
        npm_config_cache: "/home/agent/.npm",
        npm_config_update_notifier: "false",
        npm_config_audit: "false",
        npm_config_fund: "false",
      },
    };
  }
  if (phase === "agent" && o.tokenName === "OPENAI_API_KEY") {
    // E3в: Codex. The token is the per-task mdt_ (И1); the base URL is in argv (-c model_providers.mandat.base_url).
    return {
      names: ["OPENAI_API_KEY", "AWS_SECRET_ACCESS_KEY"],
      publicValues: { ...BASE_PUBLIC, CODEX_HOME: "/m/codex-home", npm_config_update_notifier: "false", npm_config_offline: "true", MANDAT_NOTES: "/m/out/notes.txt" },
    };
  }
  if (phase === "agent") {
    return {
      names: [o.tokenName ?? "ANTHROPIC_API_KEY", "AWS_SECRET_ACCESS_KEY"],
      publicValues: {
        ...BASE_PUBLIC,
        CLAUDE_CONFIG_DIR: "/home/agent/.claude",
        ANTHROPIC_BASE_URL: "http://egress-gate",
        ANTHROPIC_DEFAULT_HAIKU_MODEL: "claude-haiku-5-5",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
        DISABLE_AUTOUPDATER: "1",
        DISABLE_UPDATES: "1",
        npm_config_update_notifier: "false",
        npm_config_offline: "true",
        MANDAT_NOTES: "/m/out/notes.txt",
      },
    };
  }
  const testsEnv = o.testsEnv ?? {};
  for (const k of Object.keys(testsEnv)) if (SECRETS.has(k)) forbid("tests.env may not set a secret name", { name: k });
  return { names: [], publicValues: { ...BASE_PUBLIC, MANDAT_REPORT: "/m/out/report.json", ...testsEnv } };
}
