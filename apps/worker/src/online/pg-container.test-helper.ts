import { spawnSync } from "node:child_process";

// D-389: a throw-away Postgres for the Docker tests that need parallel connections (PGlite cannot). Its port is published
// on 127.0.0.1 only and the tests connect there: the container's bridge IP is reachable on Linux but not from a Mac
// (Colima or Docker Desktop keep containers inside their VM), where those tests waited until their hook timed out.
const docker = (...a: string[]) => spawnSync("docker", a, { encoding: "utf8" });

/** The host port of `docker port <name> 5432/tcp` (it may list 127.0.0.1 and [::1]); null when there is none. */
export function publishedPort(out: string): number | null {
  const m = /^127\.0\.0\.1:(\d{2,5})$/m.exec(out.trim());
  return m ? Number(m[1]) : null;
}

export function startPostgres(name: string): { url: string; stop(): void } {
  const r = docker("run", "-d", "--rm", "--name", name, "-p", "127.0.0.1::5432", "-e", "POSTGRES_PASSWORD=postgres", "postgres:17.6-alpine");
  if (r.status !== 0) throw new Error(`postgres container: ${r.stderr}`);
  const port = publishedPort(docker("port", name, "5432/tcp").stdout);
  if (port === null) throw new Error("postgres container: no published port");
  return { url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`, stop: () => void docker("rm", "-f", name) };
}
