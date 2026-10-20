# Доклад E3а — 20.10.2026

## Статус: ГОТОВО (Vercel чака Симо)

## Готово, когато
| Команда | Реален изход | |
| --- | --- | --- |
| `pnpm --filter @mandat/web build` | Next.js 16.3.8 (Turbopack): 15 маршрута (`/`, `/board`, `/tasks/[id]`, `/login`, 11 API) — ok | ✓ |
| `pnpm test:e2e` (Playwright 1.63.0, Chromium /opt/pw-browsers) | 8 passed: inbox 3 карти + обобщение + title; viewer без diff; одобри (tap); TOTP (грешен → съобщение, верен → одобрено); дъска 7 колони; POST без CSRF → 403; a11y light/dark | ✓ |
| a11y (@axe-core/playwright 4.13.0, wcag2a/aa, 21aa, 22aa) | 0 serious/critical на `/`, `/board`, `/tasks/t_seed_failed` (+ таб Дневник), `/login`, светла и тъмна тема | ✓ |
| `pnpm mandat demo seed && pnpm --filter @mandat/web start` (dev вход, отделна база) | `3 чакат · Мандат` · `1 ПРОВЕРЕНО и слети сами · 1 ПРОВАЛ · 3 чакат теб` · 3 карти | ✓ |
| `pnpm test:sentinel` | `sentinel ok: 0 hits for 5 server keys in .next (static, server, html)` | ✓ |
| `pnpm check` | build, lint, typecheck, unit 390/390, test:counts, licenses (core 50, harness 331), no-dotenv — exit 0; lines 90.3% | ✓ |
| `pnpm test:db` / `pnpm test:db:supabase` | 5 файла, 56/56 на PGlite и на локалния Supabase | ✓ |
| `vitest --config vitest.docker.config.ts --project web` | realtime: REST broadcast → член на org получава ≤ 2 s; член на друг org — CHANNEL_ERROR, 0 съобщения | ✓ |
| `pnpm gitleaks` | SKIPPED: образът ghcr.io/gitleaks не се изтегля (403 от proxy-то на сесията) | SKIPPED |

## Тестове
unit 390 (нови: web 44 — board-column вкл. сверка със SQL за всички комбинации, inbox-summary, ladder-hint, verdict-view, guard,
totp (RFC 6238 вектори), session, approve (cas/head-sha/totp: 8), rls-web, api, service-role-scope, sentinel-scan; worker seed;
cli demo seed) · docker web 1 · e2e 8. Бъг, хванат по пътя: без MANDAT_WEB_SESSION_SECRET страниците и API-то имаха различни
случайни тайни (Next bundle-ва отделно) → тайната е на globalThis + тест (D-285).

## Решения
D-284 (отворено, Q-024) · D-285 решено · D-286 (отворено, Q-025).

## Отклонения от промпта
- `since` (ISO updated_at) вместо `since_seq`: seq е на задачата, не глобален (D-286).
- Polling след > 30 s без Realtime е в клиента (components/live.tsx); автоматичен тест има само `since` пътят на API-то, не таймерът.
- Dev вход + TOTP в `private.dev_totp` е заместител на GoTrue MFA за локалното демо (т. 0.5); пътят с Supabase Auth MFA е написан
  (`mfa.challenge` + `mfa.verify`), но не е минат с реален фактор (иска enrollment в приложение).

## Сигурност
Ключът на service role: само apps/worker, packages/verify и `src/lib/server/admin.ts` (`import "server-only"`), който се внася само от
`app/api/**/route.ts` (статичен тест); sentinel build → 0. Четене под RLS като потребителя; viewer не вижда diff/task_activities (pgTAP +
rls-web). Одобрение: CAS по head_sha, частичен уникален индекс, тригер за TOTP ≤ 2 мин, ledger + outbox — една транзакция; грешка след
INSERT → нищо не остава (тест). Origin + CSRF + 1 MB + 10/мин. Паролите на seed-а се печатат веднъж (не са в repo/дневника). Realtime
private канали с RLS (без `using (true)`), проверено с два org-а.

## Чака Симо
Vercel (docs/setup/vercel.md) — не блокира. Supabase Auth MFA enrollment за approver@demo при облачния вариант.

## Часове и разход
план 34–44 ч / реално ≈ 4 ч · API $0

## Следващо
E3б: авто-харнес Ф5 минимум (т. 8.2).
