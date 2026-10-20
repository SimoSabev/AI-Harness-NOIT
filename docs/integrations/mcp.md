# MCP сървър `mandat` — свързване (демо промпт т. 7.4)

Инструменти: `mandat_verify` (стартира проверка, връща `job_id`), `mandat_status` (присъда, ниво ≤ 1), `mandat_explain`
(обяснение без LLM). В Claude Code пълните имена са `mcp__mandat__mandat_verify` и т.н.
Base-ът винаги се закрепя от Мандат от `--remote` (никога от агента). Резултатът е **съвет** (таван 1, без стълба).
Пакетът не е публикуван: пътищата са абсолютни. Без `env` с тайни — сървърът отказва да стартира (S35).

## Claude Code (code.claude.com/docs/en/mcp, 20.10.2026)
За сцената — scope local (в ~/.claude.json, извън репото, което агентът пише):
```sh
claude mcp add --transport stdio --scope local mandat -- node /ABS/mandat/packages/mcp/dist/main.js --allow-project-dir --remote file:///ABS/shop-remote.git
```
За екип — `.mcp.json` в корена (промяна в него е D3 config → UNKNOWN):
```json
{"mcpServers":{"mandat":{"type":"stdio","command":"node","args":["/ABS/mandat/packages/mcp/dist/main.js","--allow-project-dir","--remote","https://github.com/<owner>/<repo>.git"]}}}
```
Headless: `claude -p --strict-mcp-config --mcp-config ./.mcp.json --allowedTools "mcp__mandat__mandat_verify,mcp__mandat__mandat_status,mcp__mandat__mandat_explain" "…"`.

## Codex (openai/codex @ 4e7b9e2)
```sh
codex mcp add mandat -- node /ABS/mandat/packages/mcp/dist/main.js --allow /ABS/shop --remote file:///ABS/shop-remote.git
```
или `~/.codex/config.toml`:
```toml
[mcp_servers.mandat]
command = "node"
args = ["/ABS/mandat/packages/mcp/dist/main.js", "--allow", "/ABS/shop", "--remote", "file:///ABS/shop-remote.git"]
# enabled_tools = ["mandat_verify","mandat_status","mandat_explain"]
```

## Claude Desktop
macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\Claude\claude_desktop_config.json`:
```json
{"mcpServers":{"mandat":{"command":"node","args":["/ABS/mandat/packages/mcp/dist/main.js","--allow","/ABS/shop","--remote","<url>"]}}}
```
Пълен рестарт на приложението.

## OpenCode (само документация, без тест)
```json
{"$schema":"https://opencode.ai/config.json","mcp":{"mandat":{"type":"local","command":["node","/ABS/mandat/packages/mcp/dist/main.js","--allow","/ABS/shop","--remote","<url>"],"enabled":true}}}
```

## Изолация
С `mandat-verifyd` под отделен потребител (docs/setup/verifyd.md) сървърът е само клиент на сокета (`--socket`,
по подразбиране `/run/mandat/verifyd.sock`). Без него: `--same-uid` → VERIFIED се показва като UNKNOWN `INFRA:same_uid:-`
(„съвет, без изолация“); FAILED остава FAILED.

## Ръчна проверка
```sh
node scripts/mcp-call.mjs --server "node packages/mcp/dist/main.js --same-uid --allow /ABS/shop --remote file:///ABS/shop.git" --tool mandat_verify
node scripts/mcp-call.mjs --server "…same…" --tool mandat_status --job <id> --wait
```
