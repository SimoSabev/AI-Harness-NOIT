# SH2-CX — контролният слой на Codex (v5 т. 3.1, D-312)

Статус (22.10.2026): **механиката е готова за E8а; живият вариант SKIPPED — липсва OPENAI_API_KEY в проксито**.

План (по v5): `CODEX_HOME=/m/codex-home` (tmpfs, D-222) се сийдва от `/m/in/harness/codex` (config.toml с `[hooks]`/
`[mcp_servers]`/`[agents]`, hooks.json, skills/). След агента worker-ът хешира сийда срещу оригинала → разлика =
security_event `config_change` + UNKNOWN. Хешът: `harnessFilesHash(files)` (apps/worker/src/harness-seed.ts).

Готово офлайн:
- `deny-by-policy.mjs` приема и входа във формата на Codex (`command` като масив `["bash","-lc","…"]`) — hooks.test.ts.
- `SecurityEventKind` има `config_change` (v5 2.6).

[НП] (живото пускане решава): чете ли се `hooks.json` при `--ignore-user-config`; точният формат на входа на
`pre_tool_use`; `allow_managed_hooks_only` не се ползва (няма requirements.toml в пясъчника).
Команда: в docs/setup/local-live-checklist.md, стъпка „SH2-CX“.
