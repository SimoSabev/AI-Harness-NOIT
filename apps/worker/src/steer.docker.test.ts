import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildShopFixture } from "./index.js";
import { runTask } from "./run.js";
import { dockerEnv, repoRoot } from "./testing.js";

// E8g (v5 p. 4.4 (3), AC-8.5): a person's steer text reaches the live agent over stdin (docker run -i) and shows up in
// the transcript, framed as untrusted input. The fake replays every user line it gets, like --replay-user-messages.
const home = mkdtempSync(path.join(os.tmpdir(), "mandat-steer-"));
beforeAll(async () => {
  await dockerEnv();
  buildShopFixture({ repoRoot, mandatHome: home, force: false });
});

describe("steer (docker, fake:steer-echo)", () => {
  it("the steer text is in the transcript; the run finishes VERIFIED", async () => {
    let sent = false;
    const r = await runTask({
      home, contractPath: path.join(repoRoot, "contracts/fix-discount.json"), agent: "fake:steer-echo", keep: false, json: true,
      hooks: { steer: () => Promise.resolve(sent ? [] : ((sent = true), [{ text: "keep the amounts in cents", author: "member" }])) },
    });
    expect(r.verdict?.result).toBe("VERIFIED");
    const transcript = readFileSync(path.join(r.runDir ?? "", "transcript.jsonl"), "utf8");
    expect(transcript).toContain('source=\\"steer\\">keep the amounts in cents</untrusted>');
  }, 900_000);
});
