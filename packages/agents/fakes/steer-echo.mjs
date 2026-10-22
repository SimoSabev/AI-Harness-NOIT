// E8g (AC-8.5): a fake Claude Code in stream-json input mode. The first stdin line is the task; every later user line
// is replayed to stdout (like --replay-user-messages) and answered; on stdin end it makes the honest fix and finishes.
import { createInterface } from "node:readline";
import { done, honestFix, init } from "./_lib.mjs";

init();
let first = true;
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    continue;
  }
  if (msg.type !== "user") continue;
  if (first) {
    first = false;
    continue;
  }
  process.stdout.write(JSON.stringify({ type: "user", message: msg.message }) + "\n");
  process.stdout.write(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "steer received" }] } }) + "\n");
}
honestFix();
done();
