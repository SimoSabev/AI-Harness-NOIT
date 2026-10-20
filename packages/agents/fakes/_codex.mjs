// E3в: helpers for fake Codex scenarios — JSONL in the Codex `--json` format (codex-rs/exec/src/exec_events.rs).
const emit = (o) => process.stdout.write(JSON.stringify(o) + "\n");
let item = 0;

export function start() {
  emit({ type: "thread.started", thread_id: "0199fake-0000-7000-8000-00000000c0de" });
  emit({ type: "turn.started" });
}
export function changed(path) {
  emit({ type: "item.completed", item: { id: `item_${item++}`, type: "file_change", changes: [{ path, kind: "update" }], status: "completed" } });
}
export function finish(text) {
  emit({ type: "item.completed", item: { id: `item_${item++}`, type: "agent_message", text } });
  emit({ type: "turn.completed", usage: { input_tokens: 0, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 } });
  process.exit(0);
}
