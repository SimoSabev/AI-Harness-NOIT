# Вход в Claude Code / Codex за сцената — чеклист за Симо

Заместител без вход: `scripts/mcp-call.mjs` (JSON-RPC клиент към MCP сървъра), виж docs/integrations/mcp.md.
1. Claude Code: `claude` → `/login` (абонамент или API ключ в твоя терминал; кодерът не го вижда).
2. Codex: `codex login`.
3. Свържи сървъра по docs/integrations/mcp.md (scope local за Claude Code).
4. Live проверка: в копие на demo-shop на клон fix/discount с изтрит тест:
   `claude -p --strict-mcp-config --mcp-config ./.mcp.json --allowedTools "mcp__mandat__mandat_verify,mcp__mandat__mandat_status,mcp__mandat__mandat_explain" "Call mandat_verify and then mandat_status until done; print the result"` → FAILED.
