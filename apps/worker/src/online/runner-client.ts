import { RunnerClaimReply, RunnerHeartbeatReply, RunnerRegisterReply, RunnerTokenReply } from "@mandat/contract";
import type { RunnerHeartbeatReply as Heartbeat, RunnerKind, RunnerOutboxRow, RunnerRegisterReply as Registered } from "@mandat/contract";
import type { OutboxKind, OutboxRow, OutboxStore } from "./outbox.js";

// E10 hosted (v5 т. 6.1, D-701/D-702): the runner's side of /api/runner/*. It keeps its secret in memory (the caller
// stores it 0600), asks for a JWT when the last one is within a minute of its expiry, and never logs either.

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; json(): Promise<unknown> }>;

export class RunnerHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`runner api: ${status} ${code}`);
  }
}

export class RunnerClient {
  private readonly base: string;
  private readonly fetcher: FetchLike;
  private readonly now: () => number;
  private id: string | null = null;
  private secret: string | null = null;
  private jwt: { token: string; exp: number } | null = null;
  constructor(o: { url: string; fetch?: FetchLike; now?: () => number }) {
    this.base = o.url.replace(/\/+$/, "");
    this.fetcher = o.fetch ?? ((u, i) => fetch(u, i));
    this.now = o.now ?? (() => Date.now());
  }

  private async call(path: string, body: unknown, auth: string | null): Promise<unknown> {
    const r = await this.fetcher(`${this.base}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (r.status >= 300) throw new RunnerHttpError(r.status, typeof j === "object" && j !== null && "error" in j ? String((j as { error: unknown }).error) : "error");
    return j;
  }

  private async bearer(): Promise<string> {
    if (this.jwt && this.jwt.exp - this.now() > 60_000) return this.jwt.token;
    if (!this.id || !this.secret) throw new RunnerHttpError(401, "not_logged_in");
    const t = RunnerTokenReply.parse(await this.call("/api/runner/token", { runner_id: this.id, secret: this.secret }, null));
    this.jwt = { token: t.token, exp: Date.parse(t.expires_at) };
    return t.token;
  }

  /** an authenticated call; a 401 (expired or rotated token) is retried once with a fresh JWT */
  private async authed(path: string, body: unknown): Promise<unknown> {
    try {
      return await this.call(path, body, await this.bearer());
    } catch (e) {
      if (!(e instanceof RunnerHttpError) || e.status !== 401 || !this.jwt) throw e;
      this.jwt = null;
      return this.call(path, body, await this.bearer());
    }
  }

  async register(b: { token: string; name: string; kinds: RunnerKind[] }): Promise<Registered> {
    return RunnerRegisterReply.parse(await this.call("/api/runner/register", b, null));
  }
  login(runnerId: string, secret: string): void {
    this.id = runnerId;
    this.secret = secret;
    this.jwt = null;
  }
  async heartbeat(): Promise<Heartbeat> {
    return RunnerHeartbeatReply.parse(await this.authed("/api/runner/heartbeat", {}));
  }
  async claim(limit: number): Promise<RunnerOutboxRow[]> {
    return RunnerClaimReply.parse(await this.authed("/api/runner/outbox/claim", { limit })).rows;
  }
  async done(id: number): Promise<void> {
    await this.authed(`/api/runner/outbox/${id}/done`, {});
  }
  async failed(id: number, error: string): Promise<void> {
    await this.authed(`/api/runner/outbox/${id}/failed`, { error: error.slice(0, 300) || "failed" });
  }
  async extend(id: number): Promise<{ lease_until: string }> {
    return (await this.authed(`/api/runner/outbox/${id}/extend`, {})) as { lease_until: string };
  }
}

/**
 * The outbox through a runner: the same OutboxStore the hosted worker drains with SQL, so `drainOutbox` and the effect
 * handlers run unchanged on the runner. The lease replaces the claim transaction; `final` is the server's call.
 */
export class HttpOutbox implements OutboxStore {
  private org = "";
  constructor(private readonly client: RunnerClient) {}
  async claim(limit: number): Promise<OutboxRow[]> {
    if (this.org === "") this.org = (await this.client.heartbeat()).org_id;
    const rows = await this.client.claim(Math.min(limit, 20));
    return rows.map((r) => ({ id: r.id, org_id: this.org, kind: r.kind as OutboxKind, idempotency_key: r.idempotency_key, payload: r.payload, attempts: r.attempts }));
  }
  markDone(id: number): Promise<void> {
    return this.client.done(id);
  }
  markFailed(id: number, error: string): Promise<void> {
    return this.client.failed(id, error);
  }
  release(): Promise<void> {
    return Promise.resolve();
  }
}
