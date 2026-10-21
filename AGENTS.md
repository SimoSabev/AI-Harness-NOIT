# AGENTS.md — хранилището на Мандат
Мандат: задача → агент в Docker пясъчник → безопасен износ → присъда (D1–D4) → дневник.
GPL-3.0-or-later. TypeScript, Node 24.22.0, pnpm 12.14.0, Turborepo, Vitest, zod.

## Команди
- Инсталация: `pnpm install --frozen-lockfile`
- Build: `pnpm build`
- Всички проверки: `pnpm check` (build, lint, типове, unit тестове с покритие, лицензи, no-dotenv)
- Един пакет: `pnpm --filter @mandat/core test`
- Docker тестове: `pnpm test:docker` (Docker ≥ 25.0.5, образите: `pnpm mandat images build`)
- CLI: `pnpm mandat <run|verify-log|bench|redteam|doctor|images|proxy|fixtures|contract>`
- Тайни: `pnpm gitleaks`

## Карта
- packages/contract: zod схеми и типове (единен източник), JCS, хешове
- packages/core: детектори и присъда; ЧИСТИ функции, без I/O
- packages/ledger, redaction, export, sandbox, egress-gate, llm-proxy, channels, agents, cli
- apps/worker: оркестраторът на `mandat run`
- fixtures/shop: демо хранилище; bench/: сценарии и червен отбор
- docs/decisions.md: всяко решение с „защо“

## Правила (задължителни)
1. Тестове първо: червен тест → код → зелен. Без код без тест.
2. Агентът в пясъчника НИКОГА не получава истински API ключ; само mdt_ токен. Ключът е само в llm-proxy.
   Изключение (D-295, Симо 21.10.2026): вход в абонамент. Непромененият CLI в пясъчника държи своя вход (volume на профила,
   вход през потока на доставчика); харнесът не го чете; мрежата на агента е само CONNECT тунел до доставчика.
3. Без git push, без промени по remote, без публикуване на образи.
4. Не четеш, не печаташ и не зареждаш .env. В .env.example има само имена.
5. Не логваш ключове, mdt_ токени, canary стойности, тела на LLM заявки и env.
6. packages/core не импортира sandbox/egress-gate/llm-proxy/agents/export/child_process.
7. Docker флаговете на пясъчника идват само от SANDBOX_HARDENING; без --privileged, --cap-add, publish, docker.sock.
8. Нова зависимост: точна версия, ≥ 3 дни от публикуване, лиценз в license-allowlist.json, ред в docs/dependencies.md.
9. Всеки CLI флаг или факт за външен инструмент: линк + дата в docs/decisions.md; непровереното е [НП] + спайк.
10. Малки комити: един логически ход; съобщение `<пакет>: <какво>` на английски.
11. При неясно: спри и питай; не измисляй интерфейси извън packages/contract.

## Стил
ESM, само именувани exports, kebab-case файлове, грешки чрез MandatError с code.
Без `any` (lint грешка); zod на всяка граница (файл, мрежа, CLI вход).

<!-- mandat-coder:begin -->
Следваща стъпка: виж docs/progress.md (раздел „Текуща задача“) и docs/spec/НОИТ_Мандат_v4_демо_промпт_кодер.md.
<!-- mandat-coder:end -->
