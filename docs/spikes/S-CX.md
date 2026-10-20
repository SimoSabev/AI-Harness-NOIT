# Спайк S-CX — codex exec в пясъчника през gate → прокси (демо промпт т. 8.3)

Статус: **SKIPPED — липсва OPENAI_API_KEY** (20.10.2026). Бюджет ≤ 2 ч, ≤ $0,50; пуска се само с ключ от Симо.

## Какво е готово офлайн
- Образът `mandat-sandbox` съдържа @openai/codex 0.160.1 (`codex --version` → `codex-cli 0.160.1`), двата tarball-а по integrity.
- argv (D-222): `packages/agents/src/codex/argv.ts`, тест codex-argv; parse: `codex/stream.ts`, fixtures/codex-jsonl/* (синтетични).
- Проксито: POST /v1/responses → MANDAT_UPSTREAM_OPENAI, Bearer с истинския ключ, usage от `response.completed` (fixtures/openai-sse/responses.sse, синтетичен), Upgrade → 403.
- Gate: route POST exact /v1/responses → llm_proxy; Upgrade → 403 (gate.test.ts).

## Как да се пусне (Симо)
1. `OPENAI_API_KEY=… MANDAT_PROXY_OPENAI_PRICES='{"<модел>":{"input":…,"cached_input":…,"output":…}}' pnpm mandat proxy start` (docs/setup/keys.md).
2. Задача с агент `codex` на канал `openai-key-demo` (модел от model_channels) през `mandat worker --once`.
3. Критерии: `turn.completed`, usage > 0, в лога на gate-а само `/v1/responses`, без websocket, маркерът от AGENTS.md
   (`project_doc_max_bytes=0`) не се появява в отговора. Записът отива в fixtures/codex-jsonl/live-*.jsonl.
4. Ако `-s workspace-write` не работи в rootless Docker: резервата `--dangerously-bypass-approvals-and-sandbox` е позволена
   само вътре в нашия пясъчник и само след като S-CX го докаже (D-288, отворено).

## Известно ограничение до S-CX
Ако `project_doc_max_bytes=0` не спре четенето на AGENTS.md, износът вече третира AGENTS.md като config клас (D3 → UNKNOWN при
промяна); четенето от агента е записано в docs/security.md.
