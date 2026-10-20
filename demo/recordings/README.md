# demo/recordings

- `scene1-task1`, `scene1-task2` (Claude Code stream-json), `scene2` (Codex JSONL), `scene3-live` (Claude Code + MCP):
  **синтетични** записи (20.10.2026), направени по формата на E0 (stream-json) и codex-rs/exec/src/exec_events.rs.
  Картата и терминалът ги надписват „запис от 2026-10-20 (synthetic)“. Симо подменя `scene3-live.jsonl` с живия транскрипт
  (`claude -p … --output-format stream-json > demo/recordings/scene3-live.jsonl`, docs/demo/rehearsal.md).
- `<име>.patch` до записа = промяната на агента при replay (копие от demo/patches/).
- `*.webm` — видео от Playwright (в .gitignore; `node demo/record.mjs`).
