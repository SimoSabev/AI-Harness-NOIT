import net from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { isDbConnectionError, openDb } from "./db.js";

// D-444: a minimal Postgres wire server, so a connection can really die under the pool
function fakePostgres() {
  const sockets = new Set<net.Socket>();
  const msg = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeInt32BE(body.length + 4);
    return Buffer.concat([Buffer.from(type), len, body]);
  };
  const ready = msg("Z", Buffer.from("I"));
  const server = net.createServer((s) => {
    sockets.add(s);
    s.on("error", () => undefined);
    s.on("close", () => sockets.delete(s));
    let started = false;
    s.on("data", (d) => {
      if (!started) {
        started = true;
        s.write(Buffer.concat([msg("R", Buffer.alloc(4)), ready]));
      } else if (d[0] === 0x51) {
        s.write(Buffer.concat([msg("C", Buffer.from("SELECT 0\0")), ready]));
      }
    });
  });
  return {
    listen: () => new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port))),
    killAll: () => {
      for (const s of sockets) s.destroy();
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
const tickOver = () => new Promise((r) => setTimeout(r, 50));

describe("връзката с базата (D-444)", () => {
  const pg = fakePostgres();
  let port = 0;
  beforeAll(async () => {
    port = await pg.listen();
  });
  afterEach(async () => {
    pg.killAll();
    await tickOver();
  });
  afterAll(() => pg.close());

  it("разпознава загубена връзка, включително през cause; SQL грешката не е такава", () => {
    expect(isDbConnectionError(Object.assign(new Error("Connection terminated due to connection timeout"), { cause: new Error("Connection terminated unexpectedly") }))).toBe(true);
    expect(isDbConnectionError(new Error("timeout exceeded when trying to connect"))).toBe(true);
    expect(isDbConnectionError(Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" }))).toBe(true);
    expect(isDbConnectionError(Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }))).toBe(true);
    expect(isDbConnectionError(Object.assign(new Error('relation "x" does not exist'), { code: "42P01" }))).toBe(false);
    expect(isDbConnectionError(new Error("a bug"))).toBe(false);
    expect(isDbConnectionError("Connection terminated")).toBe(false);
  });

  it("база, която не отговаря → разпозната грешка, не срив", async () => {
    const db = openDb("postgresql://u:p@127.0.0.1:1/x");
    const e: unknown = await db.query("select 1").catch((x: unknown) => x);
    expect(isDbConnectionError(e)).toBe(true);
    await db.end();
  });

  it("умряла свободна връзка не срива процеса; следващата заявка се свързва наново", async () => {
    const db = openDb(`postgresql://u:p@127.0.0.1:${port}/x`);
    await db.query("select 1");
    pg.killAll();
    await tickOver();
    await expect(db.query("select 1")).resolves.toEqual({ rows: [] });
    await db.end();
  });

  it("умряла заета връзка не срива процеса", async () => {
    const db = openDb(`postgresql://u:p@127.0.0.1:${port}/x`);
    const c = await db.connect();
    pg.killAll();
    await tickOver();
    c.release();
    await expect(db.query("select 1")).resolves.toEqual({ rows: [] });
    await db.end();
  });
});
