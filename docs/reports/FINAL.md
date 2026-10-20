# Мандат — демо за НОИТ: финален доклад (20.10.2026)

## Накратко
Всички фази от демо промпта са направени: E1а → E1б → E1в → E2 → E3а → E3б → E3в → E3г → E4. Трите сцени вървят офлайн
детерминистично (`node demo/run.mjs --scene N --offline --replay` → „СЦЕНА N: OK“, 3 репетиции: 0:54–0:56 / 1:01–1:05 /
0:38 при лимит 4 / 2 / 3 мин). Живите варианти чакат неща, които иска човек (ключове, GitHub App-ове, VAPID, телефон) —
всяко е описано в docs/setup/*.md и в docs/questions-for-simo.md (Q-017…Q-029).

## Какво има
| Част | Къде | Проверено с |
| --- | --- | --- |
| Ядро (Apache-2.0): договор, детектори D1–D4/D7/D10, стълба, единна verifyChange, mandat-verify | packages/contract, core, verify, ledger | unit + docker (bench 8/8, fail-gate exit ≠ 0) |
| Онлайн ядро: Supabase схема, RLS, дневник в Postgres, outbox, worker daemon | supabase/, apps/worker | pgTAP на PGlite и на локален Supabase; worker unit + docker |
| Врата GitHub + външна присъда на чужд PR | packages/gate-github | fakeGitHub (ruleset 405/409/422), docker external PR |
| MCP сървър `mandat` + verifyd | packages/mcp | stdio legacy/modern, SDK клиент, docker |
| Харнес UI (inbox, дъска, карта, одобрение с TOTP, живо обновяване) | apps/web | e2e + axe (светла/тъмна), realtime на локален Supabase, sentinel build |
| Авто-харнес без AI (скенер, предложение със source, AGENTS.md, drift) | packages/onboard | 6 snapshot fixtures, e2e Свържи → Одобри → PR чернова |
| Канали, резерва към OpenAI, Codex адаптер | packages/channels, agents/codex, llm-proxy | docker spill (429 → Codex → VERIFIED, опит 2, ниво 0) |
| PWA и web push | apps/web, apps/worker/push | инсталируемост (CDP), push-send към локален endpoint, SSRF тестове |
| Демото | demo/, docs/demo/rehearsal.md | run.mjs 3 сцени, scene3-variants (9 реда) в Docker, UI видео + скрийншоти |

## Числа (последно пускане)
Вж. docs/reports/E4.md (unit, docker, e2e, test-counts).

## Важни решения и тълкувания (за преглед от Симо)
D-284 (CC-BY-4.0 за caniuse-lite), D-285 (четене под RLS, писане през service_role, локален демо вход), D-286, D-287,
D-288 (лимитът се вижда от проксито; празна промяна не е VERIFIED онлайн), D-289 (push с pinned IP), D-290 (демото).

## Бъгове, намерени по пътя (и поправени с тест)
- Тайната на сесията без env се различаваше между страниците и API-то (Next bundle-ва отделно) → globalThis.
- Codex нямаше да получи OPENAI_API_KEY в пясъчника (envForPhase) → токенът по доставчик + CODEX_HOME.
- Ход без промени излизаше VERIFIED онлайн и би качил стълбата → HELD empty_change.
- daemon не записваше доставката на PR → „Отвори PR“ и ready_for_review не работеха → deliveries за клон/PR.
- UI показваше рамката `<untrusted>` (за промптове) на хора → ID като «текст».

## Честни ограничения
- Записите за replay са синтетични (надписани); Симо записва живия транскрипт на сцена 3.
- Частичният diff при преливане не се прилага в новия пясъчник (Q-028).
- Базовата линия в пясъчника не се пуска при „Свържи“ (Q-026).
- S-CX (истински Codex) е SKIPPED без OPENAI_API_KEY; JSONL/SSE на OpenAI са синтетични до него.
- Живите тестове (GitHub L1–L3, TSA, Claude Code + MCP, push на телефон) са SKIPPED без ключове (D-276).
- Gitleaks не беше пуснат в облачната сесия (образът му не се тегли: 403 от proxy-то).
- Нищо не е push-нато и нищо не е деплойнато (AGENTS.md правило 3); клоновете са локални phase/*.

## Какво трябва от Симо, по ред
1. Ключове в терминала на проксито (docs/setup/keys.md): ANTHROPIC_API_KEY; за сцена 2 live — OPENAI_API_KEY + цена.
2. GitHub App-ове Writer/Observer + демо репо (`pnpm mandat demo export-repo --out …`, docs/setup/github-apps.md).
3. VAPID ключове и телефон (docs/setup/push.md); Supabase облак/Vercel по желание (docs/setup/vercel.md).
4. Запис на живия транскрипт на сцена 3 и репетиция по docs/demo/rehearsal.md.
5. Отговори на Q-017…Q-029 (всеки има избран вариант по подразбиране; нищо не блокира офлайн демото).
