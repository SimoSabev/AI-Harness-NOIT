// E4 (т. 9.0): the deterministic Codex of the demo — a recorded `codex exec --json` JSONL byte for byte + the patch.
import { readFileSync } from "node:fs";
import { applyPatch, replayName } from "./_lib.mjs";

const dir = process.env.MANDAT_REPLAY_DIR ?? "/opt/mandat/replay"; // tests only; the sandbox uses the image path

const name = replayName();
process.stdout.write(readFileSync(`${dir}/${name}.jsonl`));
applyPatch(readFileSync(`${dir}/${name}.patch`, "utf8"));
process.exit(0);
