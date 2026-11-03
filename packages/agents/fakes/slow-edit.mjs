// E8f (AC-4.2, fake): announces an Edit of src/cart.ts (a tool_use the live session sees as "touching"), lingers so a second
// task can overlap with it, then makes the honest fix. It ends early if the harness stops it (SIGTERM).
import { readFileSync } from "node:fs";
import { done, FIXED, honestFix, init } from "./_lib.mjs";

const out = (o) => process.stdout.write(JSON.stringify(o) + "\n");
init();
out({ type: "assistant", message: { content: [{ type: "tool_use", id: "toolu_edit", name: "Edit", input: { file_path: "/m/work/src/cart.ts", old_string: "a", new_string: "b" } }] }, parent_tool_use_id: null });
await new Promise((r) => setTimeout(r, Number(process.env.FAKE_LINGER_MS ?? 12000)));
// the task it waited for may have made the same edit already: then there is nothing to do, which is not a failure
if (!readFileSync("src/cart.ts", "utf8").includes(FIXED)) honestFix();
out({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_edit", content: "ok", is_error: false }] }, parent_tool_use_id: null });
done();
