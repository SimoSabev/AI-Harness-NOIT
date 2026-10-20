import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// Демо промпт т. 9.8 compose-config.test + т. 9.1 ci-yml.test (S32).
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
type Svc = { ports?: string[]; expose?: string[]; environment?: Record<string, string>; networks?: string[] };
const compose = parse(readFileSync(path.join(repo, "deploy/docker-compose.core.yml"), "utf8")) as { services: Record<string, Svc>; networks: Record<string, { internal?: boolean }> };

describe("compose-config", () => {
  it("само caddy има ports (443); worker и llm-proxy само expose; проксито е само във вътрешната мрежа", () => {
    const withPorts = Object.entries(compose.services).filter(([, s]) => s.ports).map(([n, s]) => [n, s.ports]);
    expect(withPorts).toEqual([["caddy", ["443:443"]]]);
    expect(compose.services.worker?.expose).toEqual(["8790"]);
    expect(compose.services.worker?.environment?.MANDAT_WEBHOOK_HOST).toBe("0.0.0.0");
    expect(compose.services["llm-proxy"]?.networks).toEqual(["internal"]);
    expect(compose.networks.internal?.internal).toBe(true);
  });
  it("Caddyfile: само /api/webhooks/* → worker; няма /proxy и llm-proxy", () => {
    const c = readFileSync(path.join(repo, "deploy/Caddyfile"), "utf8").split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    expect(c).toContain("handle /api/webhooks/*");
    expect(c).toContain("reverse_proxy worker:8790");
    expect(c).not.toMatch(/\/proxy|llm-proxy|8787|8788/);
  });
  it("docker compose config → валиден (ако има docker compose)", () => {
    let have = true;
    try {
      execFileSync("docker", ["compose", "version"], { stdio: "ignore" });
    } catch {
      have = false;
    }
    if (!have) return;
    const env = { ...process.env, MANDAT_DOMAIN: "mandat.example", MANDAT_DB_URL: "postgresql://x", MANDAT_ROOTLESS_DOCKER_SOCK: "/run/user/1001/docker.sock", MANDAT_LLM_PROXY_IMAGE: "mandat-llm-proxy:test", ANTHROPIC_API_KEY: "placeholder" };
    const out = execFileSync("docker", ["compose", "-f", path.join(repo, "deploy/docker-compose.core.yml"), "config", "--format", "json"], { env, encoding: "utf8" });
    const j = JSON.parse(out) as { services: Record<string, { ports?: unknown[] }> };
    expect(Object.keys(j.services).sort()).toEqual(["caddy", "llm-proxy", "worker"]);
    expect(Object.entries(j.services).filter(([, s]) => s.ports && s.ports.length > 0).map(([n]) => n)).toEqual(["caddy"]);
  });
  it("docker/worker/Dockerfile: без Claude Code и Codex (K2)", () => {
    const d = readFileSync(path.join(repo, "docker/worker/Dockerfile"), "utf8").split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    expect(d).not.toMatch(/claude-code|@openai\/codex/);
  });
});

describe("ci-yml (S32)", () => {
  const raw = readFileSync(path.join(repo, "fixtures/demo-shop/.github/workflows/ci.yml"), "utf8");
  const y = parse(raw) as { on: Record<string, unknown>; permissions: Record<string, string>; jobs: Record<string, { steps: { uses?: string; run?: string }[] }> };
  it("без pull_request_target и workflow_run; permissions contents: read; тестовете от HEAD", () => {
    expect(Object.keys(y.on).sort()).toEqual(["pull_request", "push"]);
    expect(raw).not.toMatch(/pull_request_target|workflow_run/);
    expect(y.permissions).toEqual({ contents: "read" });
    const steps = y.jobs.test?.steps ?? [];
    expect(steps.map((s) => s.uses).filter(Boolean)).toEqual(["actions/checkout@v7.0.1", "actions/setup-node@v7.1.0"]);
    expect(steps.map((s) => s.run).filter(Boolean)).toEqual(["npm ci --ignore-scripts", "npx vitest run"]);
  });
});
