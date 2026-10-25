import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ORG_ID } from "../../../../worker/src/online/seed";
import { library } from "./library";
import { asService } from "./sql";
import { U, changesetOf, webDb } from "./web-db.test-helper";

describe("library: всичко, което агентите са написали", () => {
  let db: Awaited<ReturnType<typeof webDb>>;
  beforeAll(async () => {
    db = await webDb();
    const cs = await changesetOf(db, "t_seed_feature");
    await asService(db, (sql) => sql.query("update public.changeset_diffs set diff = $2 where changeset_id = $1::uuid", [cs.id, "diff --git a/docs/research.md b/docs/research.md\nnew file mode 100644\n--- /dev/null\n+++ b/docs/research.md\n@@ -0,0 +1,2 @@\n+# Проучване\n+ред\n"]));
  });
  afterAll(async () => db.end());

  it("по задача: най-новата промяна, файловете, статусът; най-новите първи", async () => {
    const l = await library(db, U.approver, DEMO_ORG_ID);
    const f = l.find((x) => x.task_id === "t_seed_feature");
    expect(f).toMatchObject({ text: "Добави код за отстъпка SAVE10 в количката", agent: "claude", last_result: "VERIFIED" });
    expect(f?.files.map((x) => [x.path, x.kind])).toEqual([["docs/research.md", "added"]]);
    expect(f?.files[0]?.lines.filter((x) => x.kind === "add")).toHaveLength(2);
    expect(l.map((x) => x.task_id)).toContain("t_seed_failed");
    const at = l.map((x) => x.updated_at);
    expect([...at].sort().reverse()).toEqual(at);
  });
  it("промяна над 1 MB (без текст, с размер) остава в списъка без файлове и с размера", async () => {
    const cs = await changesetOf(db, "t_seed_failed");
    await asService(db, (sql) => sql.query("update public.changeset_diffs set diff = '', omitted_bytes = 2000000 where changeset_id = $1::uuid", [cs.id]));
    expect((await library(db, U.approver, DEMO_ORG_ID)).find((x) => x.task_id === "t_seed_failed")).toMatchObject({ files: [], omitted_bytes: 2000000 });
  });
  it("задачи без промяна не са в списъка", async () => {
    expect((await library(db, U.approver, DEMO_ORG_ID)).map((x) => x.task_id)).not.toContain("t_seed_docs");
  });
  it("друга организация не вижда нищо (RLS)", async () => {
    expect(await library(db, U.approver, "d0000000-0000-4000-8000-0000000000ff")).toEqual([]);
  });
});
