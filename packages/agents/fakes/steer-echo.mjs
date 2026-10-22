// E8g (AC-8.5): a fake Claude Code in stream-json input mode. The first stdin line is the task; user lines that arrive
// while the turn runs (up to 3 s here) are replayed to stdout (like --replay-user-messages) and answered; then the honest
// fix and the turn's result. Like the CLI, it stays until stdin ends (the worker closes it after the first result).
import { createInterface } from "node:readline";
import { honestFix, init } from "./_lib.mjs";

const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
init();
let task = false;
let finished = false;
const finish = () => {
  if (finished) return;
  finished = true;
  honestFix();
  out({ type: "result", subtype: "success", is_error: false, total_cost_usd: 0, num_turns: 1 });
};
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg?.type !== "user") return;
  if (!task) {
    task = true;
    setTimeout(finish, 3000);
    return;
  }
  if (finished) return;
  out({ type: "user", message: msg.message });
  out({ type: "assistant", message: { content: [{ type: "text", text: "steer received" }] } });
});
rl.on("close", () => {
  finish();
  process.exit(0);
});
