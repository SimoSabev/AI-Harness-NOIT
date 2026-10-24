import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_OWNER_ID } from "@mandat/worker";
import { LOCAL_DB, dbRunArgs, imageEvent, imagesStep, localBanner, waitForDocker, localDbUrl, localPreflight, localJobEnv, localWebArgs, localWebBin, localWebEnv, pendingMigrations, retryWithoutApt } from "./commands/local.js";

// D-292: `pnpm local` — Postgres in Docker (no Supabase CLI), web + worker, one command.
describe("mandat local (D-292)", () => {
  it("the database: only on 127.0.0.1, a named volume, the pinned image; no other publish", () => {
    const a = dbRunArgs(54329);
    expect(a).toEqual([
      "run", "-d", "--name", LOCAL_DB.container, "-v", `${LOCAL_DB.volume}:/var/lib/postgresql/data`,
      "-e", "POSTGRES_PASSWORD=postgres", "-p", "127.0.0.1:54329:5432", LOCAL_DB.image,
    ]);
    expect(a.filter((x) => x === "-p")).toHaveLength(1);
    expect(LOCAL_DB.image).toBe("postgres:17.6-alpine");
    expect(localDbUrl(54329)).toBe("postgresql://postgres:postgres@127.0.0.1:54329/postgres");
  });
  it("migrations: the shim first, then the not-yet-applied files in name order", () => {
    expect(pendingMigrations(["b.sql", "a.sql"], new Set())).toEqual(["shim", "a.sql", "b.sql"]);
    expect(pendingMigrations(["b.sql", "a.sql", "c.sql"], new Set(["shim", "a.sql"]))).toEqual(["b.sql", "c.sql"]);
    expect(pendingMigrations(["a.sql"], new Set(["shim", "a.sql"]))).toEqual([]);
  });
});

describe("без вход (D-368)", () => {
  it("уебът слуша само на 127.0.0.1 (next start по подразбиране е 0.0.0.0)", () => {
    expect(localWebArgs("/h/next")).toEqual(["/h/next", "start", "-p", "3000", "-H", "127.0.0.1"]);
  });
  it("E9g A5 (D-376): next start се пуска с Node-а, който върви (process.execPath), не през pnpm — и в пакета на десктопа", () => {
    const bin = localWebBin(path.resolve(import.meta.dirname, "../../.."));
    expect(bin.replaceAll("\\", "/")).toMatch(/\/next\/dist\/bin\/next$/);
    expect(existsSync(bin)).toBe(true);
  });
  it("env на уеба: локалният собственик, без демо входа и без API ключове", () => {
    const e = localWebEnv({ PATH: "/bin", MANDAT_DEMO_DEV_AUTH: "1" }, { dbUrl: "postgresql://x", control: { url: "http://127.0.0.1:1", token: "t" } });
    expect(e.MANDAT_LOCAL_OWNER).toBe(DEMO_OWNER_ID);
    expect(e.MANDAT_DEMO_DEV_AUTH).toBeUndefined();
    expect(e).toMatchObject({ PATH: "/bin", MANDAT_DB_URL: "postgresql://x", MANDAT_LOCAL_CONTROL_URL: "http://127.0.0.1:1", MANDAT_LOCAL_CONTROL_TOKEN: "t", NEXT_TELEMETRY_DISABLED: "1" });
  });
  it("E9g review (D-374): KEK-ът от десктопа (MANDAT_KEK) остава в процеса на CLI/worker — не стига до уеб сървъра и системните задачи", () => {
    const kek = Buffer.alloc(32, 7).toString("base64");
    const w = localWebEnv({ PATH: "/bin", MANDAT_KEK: kek }, { dbUrl: "postgresql://x", control: { url: "http://127.0.0.1:1", token: "t" } });
    expect(w.MANDAT_KEK).toBeUndefined();
    expect(JSON.stringify(w)).not.toContain(kek);
    expect(localJobEnv({ PATH: "/bin", MANDAT_KEK: kek }, "postgresql://x")).toEqual({ PATH: "/bin", MANDAT_DB_URL: "postgresql://x" });
  });
  it("банерът: адресът, без имейл, парола и TOTP", () => {
    const b = localBanner(2).join("\n");
    expect(b).toContain("  Отвори:  http://localhost:3000");
    expect(b).toContain("без вход");
    expect(b).not.toMatch(/Имейл|Парола|Ключ:|otpauth/);
  });
});

describe("localPreflight (D-302)", () => {
  const good = { docker: "29.1.0", cpus: 4, node: "24.22.0", git: "2.50.1", freeGb: 40, imagesPresent: false, webPortFree: true };
  it("всичко наред → ok, по един ред на проверка", () => {
    const r = localPreflight(good);
    expect(r.ok).toBe(true);
    expect(r.lines.map((l) => l.startsWith("✓"))).toEqual([true, true, true, true, true, true]);
  });
  it("Docker не работи / стар; малко място за образите; зает порт → ясни причини и какво да направиш", () => {
    expect(localPreflight({ ...good, docker: null }).lines[0]).toContain("Пусни Docker Desktop");
    expect(localPreflight({ ...good, docker: "24.0.7" }).ok).toBe(false);
    const disk = localPreflight({ ...good, freeGb: 6 });
    expect(disk.ok).toBe(false);
    expect(disk.lines.join("\n")).toContain("нужни са ≥ 10 GB");
    expect(localPreflight({ ...good, freeGb: 6, imagesPresent: true }).ok).toBe(true);
    expect(localPreflight({ ...good, webPortFree: false }).lines.join("\n")).toContain("порт 3000 е зает");
    expect(localPreflight({ ...good, node: "22.11.0" }).ok).toBe(false);
    expect(localPreflight({ ...good, node: "26.4.0" }).lines.join("\n")).toContain("brew install node@24");
    // D-380: git is needed (the demo repo, the export); on a Mac without Command Line Tools /usr/bin/git is only a stub
    const noGit = localPreflight({ ...good, git: null });
    expect(noGit.ok).toBe(false);
    expect(noGit.lines.join("\n")).toContain("xcode-select --install");
    expect(localPreflight({ ...good, cpus: 1 }).ok).toBe(false);
  });
  it("aptFailed: повторът без apt само ако не е изключен вече", () => {
    expect(retryWithoutApt({})).toBe(true);
    expect(retryWithoutApt({ MANDAT_SANDBOX_APT: "0" })).toBe(false);
  });
});

// D-387: a missing Docker is waited for (the window says what to do), not a reason to quit.
describe("waitForDocker (D-387)", () => {
  it("up at once → true, no message", async () => {
    const said: string[] = [];
    expect(await waitForDocker({ up: () => true, sleep: async () => undefined, say: (s) => said.push(s), lang: "bg" })).toBe(true);
    expect(said).toEqual([]);
  });
  it("down → one step line in the [n/4] form, then it polls until Docker answers", async () => {
    const said: string[] = [];
    let n = 0;
    expect(await waitForDocker({ up: () => ++n > 3, sleep: async () => undefined, say: (s) => said.push(s), lang: "bg" })).toBe(true);
    expect(said).toEqual(["[1/4] Чакам Docker: пусни Docker Desktop (продължавам сам, щом тръгне)\n"]);
    expect(n).toBe(4);
  });
  it("gives up after the limit or when stopped", async () => {
    expect(await waitForDocker({ up: () => false, sleep: async () => undefined, say: () => undefined, lang: "en", tries: 5 })).toBe(false);
    const stop = new AbortController();
    stop.abort();
    expect(await waitForDocker({ up: () => false, sleep: async () => undefined, say: () => undefined, lang: "en", signal: stop.signal })).toBe(false);
  });
});

// D-387: the image build shows where it is (image k of n, the Docker step, the minutes) instead of one silent line.
describe("image build progress (D-387)", () => {
  it("reads the lines of `mandat images build` and of BuildKit", () => {
    expect(imageEvent("mandat/sandbox:abc built")).toEqual({ kind: "image" });
    expect(imageEvent("mandat/gate:abc exists")).toEqual({ kind: "image" });
    expect(imageEvent("#7 [3/9] RUN apt-get install -y git")).toEqual({ kind: "step", n: 3, of: 9 });
    expect(imageEvent("#7 0.512 Reading package lists...")).toBeNull();
  });
  it("one [3/4] line: image k of n, the step, the minutes and the usual time", () => {
    expect(imagesStep({ done: 0, total: 3, step: null, secs: 5 }, "bg")).toBe("[3/4] Образи на пясъчника: 1 от 3 · 0 мин (обикновено 5–15 мин)");
    expect(imagesStep({ done: 1, total: 3, step: { n: 4, of: 9 }, secs: 190 }, "en")).toBe("[3/4] Sandbox images: 2 of 3 · step 4/9 · 3 min (usually 5–15 min)");
  });
});
