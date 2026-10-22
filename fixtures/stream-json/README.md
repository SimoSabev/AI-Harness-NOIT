# fixtures/stream-json

- `claude-synthetic-subagent.jsonl` — **синтетичен** запис (22.10.2026) по формата на Claude Code stream-json (E0 т. 4.4):
  init, подагент (`parent_tool_use_id`), отказ (`permission_denied`), MCP, Bash с токен (redaction), неJSON ред, result с usage.
  Служи на `toStream` тестовете (v5 т. 2.1), докато няма истински запис.
- `claude-2.1.302-s0.jsonl` — **истински** запис от спайк S0 (v5 т. 3.1) след redaction (D-062). Записва се при локалното
  пускане (docs/setup/local-live-checklist.md, стъпка S0); тогава тестът „stream parser: real S0 fixture“ се активира сам.
