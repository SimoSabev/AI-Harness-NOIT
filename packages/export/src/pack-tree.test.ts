import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as tar from "tar";
import { describe, expect, it } from "vitest";
import { packTree } from "./index.js";

async function entries(stream: NodeJS.ReadableStream) {
  const out: { path: string; uid: number | undefined; gid: number | undefined; uname: string | undefined }[] = [];
  const p = new tar.Parser({ onReadEntry: (e) => { out.push({ path: e.path, uid: e.header.uid, gid: e.header.gid, uname: e.header.uname }); e.resume(); } });
  await new Promise<void>((resolve, reject) => {
    stream.pipe(p as unknown as NodeJS.WritableStream);
    p.on("end", () => resolve());
    p.on("error", reject);
  });
  return out;
}

describe("packTree (D-114)", () => {
  it("само src/ и src/a.ts; portable", async () => {
    const d = mkdtempSync(path.join(tmpdir(), "mandat-pack-"));
    for (const f of [".git/HEAD", "node_modules/x/index.js", "src/a.ts", "src/.git/HEAD"]) {
      mkdirSync(path.dirname(path.join(d, f)), { recursive: true });
      writeFileSync(path.join(d, f), "x");
    }
    const e = await entries(packTree(d));
    expect(e.map((x) => x.path).sort()).toEqual(["src/", "src/a.ts"]);
    for (const x of e) {
      expect(x.uid).toBeUndefined();
      expect(x.gid).toBeUndefined();
      expect(x.uname).toBeFalsy();
    }
  });
  it("празна папка → валиден празен tar", async () => {
    expect(await entries(packTree(mkdtempSync(path.join(tmpdir(), "mandat-pack-"))))).toEqual([]);
  });
});
