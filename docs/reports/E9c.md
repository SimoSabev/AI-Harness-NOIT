# E9в — Gemini CLI, локален модел, роли по модел, Codex профил (28.10.2026)

Клон: `claude/e9c-agents-2-7c64ed` (работи като phase/e9c-agents-2; не е пушван, не е сливан). Спец.: v5 5.3, PRD AC-3.6.
Решения: D-420–D-426. Отворени въпроси: Q-070–Q-074 (docs/questions-for-simo.md). Живи стъпки: чеклист 33–35.

## Какво е направено
| Част | Къде | Тестове |
| --- | --- | --- |
| Роли по модел: `ChannelRule` + `ruleForRole` (роля → правилото ѝ, иначе lead, иначе auto); ролите са `ModelRole` на профила | packages/contract/src/routing.ts | routing.test.ts |
| `selectChannelForRole`; локалният канал е кандидат (без дневен бюджет) | packages/channels/src/select.ts | select-role.test.ts |
| `routing_rules.role` + `ruleFor(..., role)` | supabase/migrations/20261028000420_routing_role.sql, apps/worker/src/online/channels.ts | channels-role.test.ts (PGlite) |
| `ladderCapFor(agent, kind)`: local → ниво 1 | packages/core/src/ladder.ts, daemon.ts | external-ladder-key.test.ts |
| Локален upstream от env `MANDAT_UPSTREAM_LOCAL_<label>` (+ `_MODELS`, `_WIRE`), $0, без ключ; `mandat proxy start` го подава | packages/llm-proxy/src/local-upstream.ts, server.ts, main.ts; packages/cli/src/commands/proxy.ts | proxy-local.test.ts, proxy-keys.test.ts |
| Спиране без инструменти: 3 поредни отговора без tool call (при предложени инструменти) → `noTools`, 403 `no_tools`; работникът → `agent:no_tools` | server.ts, state.ts, sse-usage.ts; apps/worker/src/run.ts | proxy-local.test.ts, run.test.ts |
| Каналът `local-<label>` → upstream със същото име | packages/channels/src/api-key-channel.ts | connection-channel.test.ts |
| Спайк SG (Gemini CLI headless) — флагове, stream-json, настройки, policies, hooks, вход, условия | docs/decisions.md D-423 | — |
| Gemini адаптер: argv, stream, to-stream, системни настройки; фикстури | packages/agents/src/gemini, fixtures/gemini-jsonl | gemini.test.ts (живият — SKIPPED, D-423) |
| Wire `gemini` в проксито: `/v1beta/models/<m>:{generateContent,streamGenerateContent,countTokens}`, `x-goog-api-key`, броене от usageMetadata | packages/llm-proxy/src/server.ts, sse-usage.ts, token.ts | proxy-gemini.test.ts |
| Канали: `conn-<id>` с provider gemini (маршрут `/v1beta/models/`), `gemini-profile-<име>` с тунелите на Google | packages/channels | connection-channel.test.ts |
| `mandat login/logout --agent codex --name …` | packages/cli/src/commands/accounts.ts, cli.ts | accounts.test.ts |
| Тунелите на ChatGPT профила по кода на Codex: chatgpt.com, auth.openai.com (без api.openai.com) | packages/channels/src/profile-channel.ts | connection-channel.test.ts |
| `pnpm test:counts` приема `// D-4xx:` над skip | scripts/check-test-counts.mjs | check-test-counts.test.ts |

## AC-3.6 (фалшив endpoint)
Минава на две нива: проксито с истински HTTP сървър и фалшив локален endpoint (proxy-local.test.ts: $0, токените се
броят, моделът извън списъка → 403, 3 отговора без инструмент → следващото повикване 403 `no_tools`, състоянието оцелява
рестарт) и работникът с fake docker (run.test.ts: usage `noTools` → `stopped: no_tools`, причина `agent:no_tools`, без износ,
$0). Нивото ≤ 1 — external-ladder-key.test.ts. Docker тестът на целия път не е писан: иска нов образ на проксито (чеклист 33).

## [НП] (непроверено)
- Gemini: `GOOGLE_GEMINI_BASE_URL` към `http://egress-gate` (документацията казва само https извън localhost); дали
  `selectedType: gemini-api-key` предотвратява exit 41; `advanced.ignoreLocalEnv`; префиксът на MCP инструментите в потока;
  кодът при HTTP грешка на API-то; пътищата/заглавката на API-то са от кода на @google/genai 1.30.0, не от жив рън.
- Тунелите за Google вход (cloudcode-pa, oauth2, www.googleapis.com) — от кода на CLI-я.
- Тунелите на Codex с ChatGPT — от кода на Codex; жив рън потвърждава (Q-074).
- Codex + локален модел: само ако endpoint-ът говори Responses API (vLLM) — `_WIRE=openai` е подготвено, не е пробвано.
- Целият Docker път на AC-3.6 и истински Ollama/vLLM.

## Какво не е направено (и защо)
- Gemini CLI в образа на пясъчника, settings.json/policies в /m/in/harness/gemini, агент `gemini` в работника и UI-я,
  доставчик Gemini в /welcome — без ключ нищо от това не може да се провери; Q-072.
- Вход с Google акаунт — условията на Gemini CLI не са ясни за обвивки; Q-073.
- UI за правило по роля; review съветникът още не избира канал по роля; Q-070.
- Ресърчът (packages/research*) и „Ключове“ не са пипани (паралелна сесия).

## Чака Симо
- Ключ за Gemini (и решение по Q-072/Q-073) → чеклист 34; живият тест в gemini.test.ts.
- `pnpm mandat login --agent codex --name …` и задача с `codex@<име>` → чеклист 35.
- Ollama без tool calling през `MANDAT_UPSTREAM_LOCAL_*` → чеклист 33.
- Отговори на Q-070–Q-074.

## Проверка (28.10.2026)
`pnpm check` не стигна до CHECK OK в тази сесия: машината беше натоварена от паралелната работа с Docker (load average
20–32). build, lint, typecheck, licenses:check и no-dotenv минават. Последното пускане: 1672 теста минават, 2 падат с
таймаут 20 s — `packages/ledger` property тест и `packages/verify` D8 (тези пакети не са пипани); и двата минават сами.
Предишните пускания имаха други таймаути (daemon, web), всички минават сами (10 файла, 104 теста). `test:counts` приема
skip-а на Gemini (D-423) и пада само заради двата таймаута. Пусни `pnpm check` на ненатоварена машина.
Бележка: в този worktree apps/desktop нямаше node_modules (инсталира се при поискване, D-303), а typecheck ги иска —
пуснато е `ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm --dir apps/desktop install --frozen-lockfile`.
