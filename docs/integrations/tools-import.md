# Внос на MCP сървъри, тулове и скилове (D-480…D-489)

Цел: човек вкарва MCP сървъри и скилове от всякакви места, вижда какво вече е вързал към своите ИИ-та на машината,
и има малък вграден набор, без да настройва нищо. Всичко минава през съществуващия път на E8д (D-354): каталог →
одобрение → vetting без мрежа → слой E на профила. Тази страница описва само входа.

## 1. Как го правят другите (проверено 04.11.2026)

| Продукт | Откъде | Как | Пиннинг / доверие | Източник |
|---|---|---|---|---|
| Официален MCP Registry | регистър | `GET /v0.1/servers` (`search`, `cursor`, `limit`), записи `server.json` с `packages[]` (npm/pypi/oci + `environmentVariables` с `isSecret`) и `remotes[]` (streamable-http/sse + `headers`) | точна версия на запис; регистърът е индекс, не гаранция | https://registry.modelcontextprotocol.io/v0.1/servers (curl 04.11.2026, 200 без ключ) |
| Smithery | каталог | търсене `GET registry.smithery.ai/servers?q=` иска Bearer ключ (без ключ: 500); **един сървър** `GET registry.smithery.ai/servers/<qualifiedName>` е публичен: `deploymentUrl`, `connections[]`, `tools[]` | отдалечен (hosted) сървър; описанията на туловете идват предварително | https://smithery.ai/docs/use/registry; curl 04.11.2026 |
| Glama | каталог | `glama.ai/api/mcp/v1/servers/<owner>/<repo>`; всичко иска API ключ (401 без ключ) + задължителна атрибуция | страницата сочи GitHub репо | curl 04.11.2026 |
| PulseMCP | каталог | `GET api.pulsemcp.com/v0.1/servers?search=`; иска `X-API-Key` + `X-Tenant-ID` (по заявка) | същата схема като официалния | https://www.pulsemcp.com/api/docs/v0.1 (04.11.2026) |
| Claude Code | JSON конфиг, плъгини | `~/.claude.json` (`mcpServers` горе и `projects[путь].mcpServers`), `.mcp.json` в проекта; `type` stdio/http/sse/ws, `command/args/env`, `url/headers`; плъгини през `.claude-plugin/marketplace.json` (източници github, git-subdir, url, npm, archive) | проектният `.mcp.json` иска одобрение; плъгин git източник може да се закове на `sha` | https://code.claude.com/docs/en/mcp, https://code.claude.com/docs/en/plugin-marketplaces (04.11.2026) |
| Codex CLI | TOML конфиг | `~/.codex/config.toml`, `[mcp_servers.<име>]`: `command/args/env/env_vars`, или `url` + `bearer_token_env_var`/`http_headers` | проектният `.codex/config.toml` само в доверени проекти | https://learn.chatgpt.com/docs/extend/mcp?surface=cli (04.11.2026) |
| Gemini CLI | JSON конфиг | `~/.gemini/settings.json` и `.gemini/settings.json`, `mcpServers`: `command/args/env`, `url` (SSE), `httpUrl` (streamable), `headers` | — | https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md (04.11.2026) |
| Cursor | JSON + deeplink | `~/.cursor/mcp.json` (`mcpServers`); `cursor://anysphere.cursor-deeplink/mcp/install?name=..&config=<base64 JSON>` | човекът потвърждава в Cursor | https://cursor.com/docs/mcp/install-links (04.11.2026) |
| OpenCode | JSON конфиг | `opencode.json`, ключ `mcp`: `type: local` (`command[]`, `environment`) / `remote` (`url`, `headers`, `oauth`) | OAuth при 401 | https://opencode.ai/docs/mcp-servers/ (04.11.2026) |
| Goose | deeplink + конфиг | `goose://extension?cmd=..&arg=..` и `~/.config/goose/config.yaml` | [НП] — страницата на документацията върна 404 на 04.11.2026 | — |
| Paperclip | скилове от GitHub | поставяш GitHub URL (репо, tree/blob към папка, `owner/repo`) или команда на skills.sh; намира всеки `SKILL.md`; **заковава commit**, после „провери за ново“ | одит от човека | https://docs.paperclip.ing/guides/org/skills (04.11.2026) |
| Multica | скилове | `multica skill import --url` (github.com, skills.sh, clawhub.ai), `--on-conflict`; закачане към агент | — (вторични източници, [НП]) | https://skillsmp.com/creators/multica-ai/multica/server-internal-service-builtin-skills-multica-skill-importing (04.11.2026) |
| T3 Code | — | не намерих собствен внос на MCP/скилове; само външни MCP сървъри, които го управляват | — | [НП], търсене 04.11.2026 |

## 2. Какво взимаме

1. **Един формат за кандидат** (`ImportCandidate`, `@mandat/mcp-bridge/import`): име, транспорт, пакет@точна версия или
   https URL, хостове за мрежата, **само имената** на тайните, произход (`origin`) и предупреждения. Всеки източник
   свършва в него; от него се прави редът в каталога (`pending`). Нищо не се пуска.
2. **Поставен JSON** — приемаме `mcpServers` (Claude/Cursor/Gemini), `servers` (VS Code), `mcp` (OpenCode), голям
   единичен запис и `server.json` на регистъра. `npx -y pkg@1.2.3` → npm пакет; `uvx`/`pipx`/`docker`/локален път →
   показва се, но **не може да се ползва** (пясъчникът пуска само npm пакети; Q-101).
3. **Тайни**: стойностите от `env` и `headers` никога не се пазят и не се връщат — само имената (D-482). Човекът
   ги въвежда после като запечатан ключ `mcp:<име>` (както днес).
4. **GitHub репо/URL** (`github.com/o/r`, `tree/<ref>/<път>`, `o/r`): четем `server.json`, после `package.json`
   (име+версия → npm), и всички `SKILL.md` (корен, `skills/*/`, посочената папка). Заковаваме commit SHA, както Paperclip.
5. **npm пакет** (`pkg`, `pkg@1.2.3`, `npmjs.com/package/..`): версията се свежда до точна при вноса (`dist-tags.latest`
   → конкретно число, показано на човека); `latest` никога не се записва.
6. **Официален регистър** — съществуващият клиент (`listRegistry`, `refFromRegistry`).
7. **Каталог: Smithery** — по име или URL на страница (`smithery.ai/server/<име>`) през публичния
   `registry.smithery.ai/servers/<име>`; туловете идват с описания и се **сканират още при вноса** (отровено описание →
   блокирано, преди одобрение). Търсене в Smithery само с ключ (Q-102). Glama/PulseMCP искат ключ и атрибуция — не сега.
8. **Отдалечен адрес**: само `https://` (http само за localhost); `/sse` се приема с предупреждение (остарял транспорт).
9. **Скил**: `SKILL.md` с frontmatter `name`/`description`; текстът се сканира със същите правила като описанията на
   туловете (невидими знаци, „ignore previous…“, четене на `~/.ssh`); блокиран скил остава с причина. Записва се с
   `source = 'user'`, `approved = false`, хеш на съдържанието; влиза в профила само след одобрение.
10. **Вече вързани** (D-485): само в локален режим и само след изрично „Разреши“, четем
    `~/.claude.json`, `~/.cursor/mcp.json`, `~/.gemini/settings.json`, `~/.codex/config.toml`, `~/.claude/skills/*/SKILL.md`.
    Парсерът проектира само позволените полета; стойности на `env`/`headers` не излизат от функцията. Бутонът
    „Ползвай в Мандат“ = внос + одобрение (кликът е одобрението), после vetting.
11. **Вграден набор** (D-486): research (търсене, страници, документация), паметта (D-402), скиловете test-first,
    review, research. Видим отделно като „Вградени — включени“.
12. Deeplink-ове (Cursor, Goose) и плъгини на Claude Code засега не се приемат като вход (Q-103).
