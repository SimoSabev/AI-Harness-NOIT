# Локален чеклист на живите части (v5 т. 0.7 (г))

Един документ за деня, в който Симо пуска харнеса локално на десктопа. Стъпките са подредени; всяка има команда,
очакван изход, кой тест става от SKIPPED в зелен и какво да пратиш на кодера. Всичко, което пращаш, минава през redaction
(транскриптите в `.mandat/runs/*/transcript.jsonl` вече са след redaction, D-062); никога не пращай ключове или `.env`.

Общо преди всичко: `pnpm install --frozen-lockfile && pnpm build && pnpm mandat images build && pnpm mandat doctor`.
Бюджет: ≤ $2 на пускане, ≤ $25 общо за v5 (D-328). Изходът на всяка стъпка: `reports/live-<стъпка>-<дата>.json` или текст.

| # | Стъпка (фаза) | Команда | Очакван изход | SKIPPED → зелено | Прати на кодера |
| --- | --- | --- | --- | --- | --- |
| 1 | Ключове в проксито (E7а/E7в) | `ANTHROPIC_API_KEY=… pnpm mandat proxy start` (отделен терминал) или „Ключове“ в UI | `pnpm --silent mandat proxy status --json` → `"state":"running"` | условие за всички live | — |
| 2 | S0: Claude Code през ключ (E7а) | `node spikes/s0-run.mjs` и `pnpm mandat run --contract contracts/fix-discount.json --agent claude` | `"S0":{"ok":true…}`; `VERDICT: VERIFIED`, exit 0; gate log без CONNECT и dns_block | `agent-stream.test.ts › stream parser: real S0 fixture` (активира се от fixtures/stream-json/claude-2.1.302-s0.jsonl, който скриптът записва) | JSON изхода + `fixtures/stream-json/claude-2.1.302-s0.jsonl` (комит) |
| 3 | S1: MCP под --bare (E7а) | `node spikes/s1-run.mjs` | `reply_has_MANDAT_S1: true`, `server_saw_tools_call: true` | `claude-mcp.live.test.ts` с `MANDAT_LIVE_CLAUDE_MCP=1` | JSON изхода |
| 4 | S2: насочване през stdin (E7а → E8г) | `node spikes/s2-run.mjs`; после `MANDAT_STEER=1 pnpm local`, задача с Claude Code, „Насочи“ докато върви | `mango_in_reply: true`, `echo_after_ms` ≤ 30000; в UI „Изпратено; агентът го вижда сега.“ и текстът в транскрипта | E8г AC-8.5 с истински агент (D-353: тогава MANDAT_STEER става по подразбиране) | JSON изхода + ред от транскрипта (след redaction) |
| 5 | SH2: контролен слой Claude (E7а → E8а) | `node spikes/sh2-run.mjs` | за A и B: `c1_hook_ran`…`c5_push_denied` = true (поне за едната) | решение D-343 → окончателно | JSON изхода (кодерът записва docs/spikes/SH2.md и D-343) |
| 6 | S-CX: Codex през ключ (E7а) | `OPENAI_API_KEY=… MANDAT_PROXY_OPENAI_PRICES='{…}' pnpm mandat proxy start`; задача с агент `codex` (docs/spikes/S-CX.md) | `turn.completed`, usage > 0, само `/v1/responses` в gate log, AGENTS.md маркерът не е в отговора | — (фикстура `fixtures/codex-jsonl/live-*.jsonl`) | транскрипта (redacted) |
| 7 | SH2-CX: контролен слой Codex (E7а → E8а) | задача с `codex` върху fixtures/demo-shop с hooks.json в `/m/in/harness/codex` (команда идва с E8а) | pre_tool_use с exit 2 блокира `git push`; хешът на сийда е непроменен | E8а `codex-hooks` live | транскрипта |
| 8 | `pnpm local` / `pnpm desktop` (E7ж) | `pnpm local` (или `pnpm desktop`) | браузър на http://localhost:…; `pnpm mandat doctor --report` → всичко ok | E7ж: изходът на doctor по ОС | `doctor --report` (без пътища) за macOS и Windows/WSL2 |
| 9 | S-SUB: абонамент (E7а) | `pnpm mandat login --name lichno` → задача с агент `claude@lichno` | `VERDICT: VERIFIED`; в gate log само `tunnel` към api.anthropic.com / console.anthropic.com / platform.claude.com:443 | S-SUB live | редовете `tunnel` от gate лога (хостове само) |
| 10 | GitHub App-ове + демо репо (E7б) | docs/setup/github-apps.md, github-demo-repo.md | App ID, installation ID в env | — | нищо тайно; само „готово“ |
| 11 | L1–L3 (E7б) | `pnpm test:live --project live` с env от docs/setup/live-tests.md | L1 check run; L2 409; L3 action_required блокира (иначе D-209 резерва) | `github.live.test.ts` | `reports/live-<дата>.json` |
| 12 | Първата истинска задача, ниво 2 (E7б) | задача по демо репото от UI → PR → CI → одобри → merge | ред в deliveries + outcomes | E7 „Готово“ | линк към PR-а |
| 13 | 10 истински задачи по 2 проекта (E7) | Q-056: fixtures/demo-shop + твое JS/TS репо | 10 присъди; ≥ 1 слята на ниво 2 | E7 „Готово“ | таблицата от UI (без код) |
| 14 | Нощна смяна (E9а) | /night → план с ≥ 6 задачи по 2 проекта | сутрин: доклад, ≥ 60% слято/готово, 0 спиране | E9а live | доклада |
| 15 | Ключове за ресърч (E8к/E9г) | Tavily/Exa/Brave ключове в „Ключове“ (по избор) | `node spikes/rs-run.mjs` (идва с E8к) | `golden.live.test.ts` | таблицата на RS |
| 16 | Подписване на десктопа (E9ж) | Apple ID/Authenticode (Q-053) | подписан dmg/msi | E9ж | — |
| 17 | ask с истински Claude Code (E8г) | с одобрен профил в /harness: в /tools `any` × `bash:npm view *` → „ask“; задача „провери версията на vitest с npm view“ с Claude Code | задачата е „Чака разрешение“ с карта `bash:npm view *`; „Разреши веднъж“ → нов опит, командата минава | E8г AC-8.1 с истински агент (hook-ът на CLI-то, не fake) | harness.json от двата опита |

Когато минеш стъпка, кажи на кодера номера ѝ; той обръща съответните SKIPPED в зелено, записва фикстурите от истинските
потоци и затваря „live чака Симо“ по фазите в docs/progress.md.
