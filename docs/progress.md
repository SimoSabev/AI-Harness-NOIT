# Прогрес на E0

| Подфаза | Статус | Последен комит | Дата | Доклад |
| --- | --- | --- | --- | --- |
| E0.1 Скелет на хранилището | ГОТОВО (чака преглед) | виж `git log -1` на клона | 20.10.2026 | docs/reports/E0.1.md |
| E0.2а Пясъчник + gate + прокси + S0, S3 | не е започната | — | — | — |
| E0.2б Агенти, износ, `mandat run` (PLACEHOLDER) + S1, S2 | не е започната | — | — | — |
| E0.3а Проверка А/Б, D1–D4, присъда | не е започната | — | — | — |
| E0.3б bench, redteam, README, финален доклад | не е започната | — | — | — |

Клон: `claude/new-session-42gq0n` (D-141; промптът казва `phase/e0-walking-skeleton`).

## Нова сесия: откъде тръгваш
1. Прочети този файл, docs/reports/E0.1.md и docs/decisions.md (D-139+ са новите решения).
2. Toolchain: Node 24.22.0 и pnpm 12.14.0 (`node -v`, `pnpm -v`); `pnpm install --frozen-lockfile && pnpm check`.
3. Следваща задача (E0.2а): `packages/contract` е готов; започни с червените тестове от т. 9.2 за `@mandat/sandbox`
   (`buildRunArgs`, `buildProxyRunArgs`, `dockerSpawnEnv`, `envForPhase`), после egress-gate (`matchPolicy`,
   `npmAllowlistFromLockfile`, DNS), после llm-proxy.

## Известни отворени неща
- CI job `docker-it` пада, докато командите `images build`, `fixtures build`, `bench`, `redteam` не съществуват (E0.2а–E0.3б).
- В облачната сесия Docker Hub връща 429 и ghcr blob хостът е блокиран → `images build` (E0.2а) вероятно не може да
  върви тук; S0–S2 искат `proxy start` с ключ от Симо (D-148, доклад E0.1).
