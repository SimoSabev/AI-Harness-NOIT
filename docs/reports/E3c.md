# Доклад E3в — 20.10.2026

## Статус: ГОТОВО (live чака Симо: OPENAI_API_KEY, модел, цена)

## Готово, когато
| Команда | Реален изход | |
| --- | --- | --- |
| `pnpm check` | build, lint, typecheck, unit 456/456, test:counts, licenses (core 50, harness 331), no-dotenv — exit 0; lines 89.3% | ✓ |
| `pnpm test:docker` | 30/30 (bench 3, egress-gate 4, gate 1, mcp 2, verify 4, web 1, worker 15 вкл. spill) | ✓ |
| `pnpm mandat demo spill --fake` (с MANDAT_EXTRA_CA_CERTS в облачната сесия) | `anthropic-key-demo 429 (resets in 2h) → spill → openai-key-demo · agent codex · attempt 2 · VERIFIED · ниво 0 → клон mandat/t_spill_da666c-a2` · `демо: лимитът е симулиран (stub-upstream --429)` · exit 0 | ✓ |
| S-CX | SKIPPED „липсва OPENAI_API_KEY“ (docs/spikes/S-CX.md) | SKIPPED |
| `pnpm test:e2e` | 10 passed (a11y вкл. /channels) | ✓ |

## Тестове
нови: select-channel 3, limit-chain 4, fallback-validation 4, openai канал 1, codex-argv 3, codex-parse 2, proxy-responses 5,
gate Upgrade 1, sandbox env за Codex, proxy start с OPENAI_API_KEY, daemon spill/wait/empty-change 3, channels-no-secrets 3,
spill.docker 1. Бъгове, хванати по пътя: (1) Codex не би получил OPENAI_API_KEY в пясъчника (envForPhase пускаше само имената
на Anthropic) — поправено + тест; (2) ход без промени излизаше VERIFIED онлайн и би качил стълбата — сега HELD empty_change.

## Решения
D-288 (отворено, Q-027, Q-028).

## Отклонения от промпта
- Частичният diff при преливане се пази като артефакт, но не се прилага в новия пясъчник (Q-028).
- JSONL на Codex и SSE на Responses са синтетични до S-CX.
- `-s workspace-write` в Docker не е проверен (S-CX).

## Сигурност
И1: агентът получава само mdt_ токен, обвързан с доставчик (claim p); токен на друг канал → 401. Истинските ключове са само в env
на проксито (`proxy start` ги подава само по име). /channels и API-то връщат само метаданни (тест). Websocket → 403 в gate-а и
проксито. Codex: `project_doc_max_bytes=0`; AGENTS.md остава config клас (D3 → UNKNOWN).

## Инфраструктура
Дискът на сесията се напълни при build на образите (стари тагове); изчистени ~20 GB (старите mandat-* образи и build cache).
e2e веднъж показа 2 неуспеха под натоварване от паралелния docker build; 4 последователни пускания след това — зелени.

## Чака Симо
OPENAI_API_KEY + модел + цена (docs/setup/keys.md); S-CX.

## Часове и разход
план 23–29 ч / реално ≈ 4 ч · API $0

## Следващо
E3г: PWA и web push (т. 8.4).
