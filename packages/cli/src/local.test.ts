import { describe, expect, it } from "vitest";
import { LOCAL_DB, dbRunArgs, localDbUrl, pendingMigrations, totpLines } from "./commands/local.js";

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

describe("totpLines (D-297)", () => {
  it("ключът и otpauth адресът за приложение за кодове", () => {
    const l = totpLines("ti@mandat.local", "ABCDEFGHIJKLMNOP");
    expect(l.join("\n")).toContain("Ключ:    ABCDEFGHIJKLMNOP");
    expect(l.join("\n")).toContain("otpauth://totp/Hamut:ti%40mandat.local?secret=ABCDEFGHIJKLMNOP&issuer=Hamut&algorithm=SHA1&digits=6&period=30");
  });
});
