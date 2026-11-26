# Hosted worker при теб (E10, v5 т. 6.1) — екип на твоя сървър

Какво е: `deploy/docker-compose.core.yml` вдига **caddy** (единственият отворен порт, 443), **worker** (hosted порт:
`/api/runner/*`, `/api/webhooks/github/*`), **llm-proxy** (единственият с ключ, само във вътрешната мрежа) и
**research** (SearXNG, своя мрежа с изход към интернет). Базата е твоята: Supabase или Postgres (`MANDAT_DB_URL`).
Екип = org; ролите са тези от E8в (owner, worker, approver, agent-operator, viewer). Член на друг екип не вижда нищо
(RLS, pgTAP `teams_rls.test.sql`). Решения D-700…D-706.

## Чака Симо: истински VPS и домейн
1. VPS по docs/setup/vps.md (Ubuntu 24.04, потребител `mandat`, rootless Docker, ufw само 22 и 443).
2. DNS: A запис `<домейн>` → IP на VPS-а. Caddy сам взима сертификат (Let's Encrypt).
3. Базата: Supabase проект (docs/setup/supabase.md, миграциите от `supabase/migrations`) или свой Postgres 17
   (миграциите се пускат със shim-а само за чист Postgres: `deploy/local/initdb.sh` показва реда).
4. Образи на VPS-а: `pnpm mandat images build` (не се публикуват; правило 3).
5. В терминала на VPS-а (нищо във файл; правило 4):
   ```bash
   cd deploy && MANDAT_DOMAIN=<домейн> MANDAT_DB_URL=<url> MANDAT_ROOTLESS_DOCKER_SOCK=/run/user/<uid>/docker.sock MANDAT_LLM_PROXY_IMAGE=<таг от images build> MANDAT_RUNNER_JWT_SECRET=$(openssl rand -hex 32) MANDAT_SEARXNG_SECRET=$(openssl rand -hex 24) ANTHROPIC_API_KEY=<ключ> docker compose -f docker-compose.core.yml up -d --build
   ```
   Пази `MANDAT_RUNNER_JWT_SECRET` за рестартите (смяната му само изисква runner-ите да вземат нов JWT — тайните им остават).
6. Проверка: `curl -s -o /dev/null -w '%{http_code}' -X POST https://<домейн>/api/runner/heartbeat` → `401`;
   `ss -ltn` → само 22 и 443.

## Екип и роли
- Хора: входът е на уеба (Supabase Auth или Better Auth, D-495); всеки е ред в `public.members` с `role_id` (`/settings/roles`).
- Нов runner (машина с Docker за ефектите `baseline`, `mcp_vet`, `harness_scan`): собственик на екипа (settings.manage) прави
  еднократен токен — `select public.runner_registration_create('<org>', '<име>', 60)` (през уеба/Supabase като себе си).
  Runner-ът го разменя веднъж на `POST /api/runner/register` за id + тайна (`mrs_…`), после `POST /api/runner/token` → JWT за
  15 мин. Пази се само хешът на тайната. Отнемане: `select public.runner_revoke('<runner id>')` — действа веднага.
- Одитен износ: `MANDAT_DB_URL=<url> pnpm mandat audit export --task <t_…>` или `--period 2026-11 --org <uuid>`;
  като член на екипа: `--as <user uuid>` (нужно е `ledger.export` — owner и worker го имат, viewer не). Проверка навсякъде,
  без база: `pnpm mandat verify-log --audit <файл>`.

## Локално (проверено на тази машина, без VPS)
```bash
pnpm build && pnpm vitest run --config vitest.docker.config.ts apps/worker/src/online/hosted-compose.docker.test.ts
```
Тестът вдига същия стек с `deploy/docker-compose.local.yml` отгоре: Postgres контейнер в ролята на „твоята база“
(shim + всички миграции), Caddy за `https://localhost` със своя вътрешен CA само на 127.0.0.1, worker с
`MANDAT_WORKER_ROLE=api` (hosted порт, без слотове за задачи → без Docker сокет). Двама души от екип A (owner и worker) плюс
viewer и човек от екип B; runner на екип A минава ефект само през HTTPS; одитният износ минава `verify-log --audit`.
`MANDAT_KEEP_STACK=1` оставя стека вдигнат (после `docker compose -p mandat-e10-it-<pid> … down -v`).

## Какво още не е (виж docs/reports/E10-hosted.md)
- Задачи на отдалечен runner (агентът в пясъчника на runner-а) — протоколът носи само ефектите от outbox-а днес.
- Worker-ът в compose стига проксито на `llm-proxy:8787`, а кодът на задачите/ресърча търси проксито на 127.0.0.1 → за
  задачи в compose на VPS-а: [НП], проверка при деплоя (чеклист ред 40).
- `MANDAT_SANDBOX_RUNTIME=runsc|sbx` — само спайк (docs/spikes/RUNSC.md).
