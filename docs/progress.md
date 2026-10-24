# Прогрес (демо промпт за НОИТ; формат т. 1.5)

| Фаза | Клон | Статус | Последен комит | Дата | Чака Симо |
| --- | --- | --- | --- | --- | --- |
| E0 (E0.1–E0.3б) | claude/new-session-42gq0n | ГОТОВО (live чака Симо) | виж клона | 20.10.2026 | proxy start с ключ: S0, S1, S2, `run --agent claude` (docs/reports/E0.3b.md) |
| E1а лиценз и граници | phase/e1a-licenses | ГОТОВО (docs/reports/E1a.md) | `git log -1 phase/e1a-licenses` | 20.10.2026 | избор apache/dual (Q-017); docs/spec файловете (Q-018) |
| E1б ядро онлайн | phase/e1b-core-online | ГОТОВО (live чака Симо) (docs/reports/E1b.md) | `git log -1 phase/e1b-core-online` | 20.10.2026 | `supabase start` локално (Q-022, docs/blockers/supabase-start.md); Supabase облак (docs/setup/supabase.md); TSA live (docs/setup/tsa.md) |
| E1в врата GitHub | phase/e1c-github-gate | ГОТОВО (live чака Симо) (docs/reports/E1c.md) | `git log -1 phase/e1c-github-gate` | 20.10.2026 | GitHub App-ове, демо репо, live L1–L3 (docs/setup/github-apps.md, live-tests.md) |
| E2 MCP сървър | phase/e2-mcp | ГОТОВО (live чака Симо) (docs/reports/E2.md) | `git log -1 phase/e2-mcp` | 20.10.2026 | потребител `mandat` + verifyd (docs/setup/verifyd.md); вход в Claude Code/Codex (docs/setup/external-agents.md) |
| E3а inbox | phase/e3a-inbox | ГОТОВО (docs/reports/E3a.md) | `git log -1 phase/e3a-inbox` | 20.10.2026 | Vercel (docs/setup/vercel.md); Q-024, Q-025 |
| E3б авто-харнес | phase/e3b-autoharness | ГОТОВО (docs/reports/E3b.md) | `git log -1 phase/e3b-autoharness` | 20.10.2026 | Q-026 (не блокира) |
| E3в канали | phase/e3c-channels | ГОТОВО (live чака Симо) (docs/reports/E3c.md) | `git log -1 phase/e3c-channels` | 20.10.2026 | OPENAI_API_KEY, модел, цена, S-CX (docs/setup/keys.md); Q-027, Q-028 |
| E3г PWA | phase/e3d-pwa | ГОТОВО (docs/reports/E3d.md) | `git log -1 phase/e3d-pwa` | 20.10.2026 | VAPID ключове, телефон (docs/setup/push.md); Q-029 |
| E4 демо | phase/e4-demo | ГОТОВО (live чака Симо) (docs/reports/E4.md) | `git log -1 phase/e4-demo` | 20.10.2026 | ключове, GitHub App-ове, VAPID, VPS, жив транскрипт (docs/reports/FINAL.md) |
| E5 минимален харнес | phase/e5-minimal | ГОТОВО (docs/reports/E5.md) | `git log -1 phase/e5-minimal` | 21.10.2026 | проба у Симо: `pnpm local` |
| E6 слабостите (D-296–D-303) | claude/new-session-42gq0n | ГОТОВО (docs/reports/E6.md) | `git log -1` | 21.10.2026 | вход в абонамент на живо; `pnpm desktop` у Симо |

Общо чака Симо: docs/spec (10 файла на спецификацията, т. 0.6; Q-018).

## v5 (PRD v1.1): фази E7–E11

В облачната сесия всичко е линейно в клона на сесията с таг `[phase/<код>]` в комитите (D-340).

| Ред | Фаза | Клон | Зависи от | Статус | Готово, когато | Live части (SKIPPED без Симо) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | E7а живи спайкове + общи договори | phase/e7a-live-spikes | — | ГОТОВО (live чака Симо) (docs/reports/E7a.md) | 5/6 | S0, S1, S2, S-CX, SH2 (live), S-SUB |
| 2 | E7б GitHub на живо | phase/e7b-github-live | E7а | ГОТОВО (live чака Симо) (docs/reports/E7b.md) | 0/3 офлайн-възможни → резервата D-209 готова | L1–L3, external-pr --live |
| 3 | E7в ключове (envelope, boot токен) | phase/e7c-key-envelope | E7а | ГОТОВО (live чака Симо; safeStorage → E9ж) (docs/reports/E7c.md) | 4/5 | истински ключ |
| 4 | E7г базова линия, flaky, рисков профил | phase/e7d-baseline | E7а | ГОТОВО (docs/tasks/e7d.md) | 4/4 | — |
| 5 | E7д сесията на живо | phase/e7e-live-session | E7а | ГОТОВО (live чака Симо) (docs/reports/E7e.md) | 3/3 | истински агент |
| 6 | E7е езиков каталог | phase/e7f-i18n | — | ГОТОВО (docs/reports/E7f.md) | все редове | — |
| 7 | E7ж първо пускане на чужда машина | phase/e7g-first-run | E7в | ГОТОВО (live чака Симо) (docs/reports/E7g.md) | 1/3 | macOS/Windows при Симо |
| 8 | E8а контролен слой и компилатор | phase/e8a-profile-compiler | E7а (SH2) | ГОТОВО (live чака Симо) (docs/reports/E8a.md) | 4/5 | истински агент с deny |
| 9 | E8б харнес-профил A–H | phase/e8b-profile | E8а, E7г | ГОТОВО („Пробвай“ отложено) (docs/tasks/e8b.md) | 3/4 | — |
| 10 | E8в роли | phase/e8c-roles | — | ГОТОВО (docs/reports/E8c.md) | 3/3 | — |
| 11 | E8г права с ask, насочване, HELD срок | phase/e8d-permissions | E8а, E8в | ГОТОВО (live чака Симо) (docs/reports/E8d.md) | 3/3 | S2 live → MANDAT_STEER=1 |
| 12 | E8д MCP каталог и скилове | phase/e8e-mcp-catalog | E8а | ГОТОВО (live чака Симо) (docs/reports/E8e.md) | 4/4 | CLI ↔ бридж на живо (чеклист 18) |
| 13 | E8е конфликти, WIP, rebase | phase/e8f-coordination | E7д | ГОТОВО (docs/reports/E8f.md) | 2/2 | — |
| 14 | E8ж доставка | phase/e8g-delivery | E7б | ГОТОВО (live чака Симо) (docs/reports/E8g.md) | 3/3 | L1–L3 |
| 15 | E8з threat model, redteam 10, bench 20 | phase/e8h-redteam | E8а, E8д | ГОТОВО (прегледът чака Симо) (docs/reports/E8h.md) | 2/3 | — |
| 16 | E8и monorepo/berry/bun | phase/e8i-runners | E7г | ГОТОВО (docs/reports/E8i.md) | 2/2 | — |
| 17 | E8к спайк RS | phase/e8k-spike-research | — | ГОТОВО (живите числа чакат Симо) (docs/reports/E8k.md) | 1/2 | ключове за доставчици |
| 18 | E9а нощна смяна | phase/e9a-night-shift | E8е, E8г | ГОТОВО (live чака Симо) (docs/reports/E9a.md) | 1/2 | нощна смяна у Симо |
| 19 | E9б D5/D8/D12/съветник | phase/e9b-judge-full | E8б | ГОТОВО (AC-5.4 на живо чака Симо) (docs/reports/E9b.md) | 5/6, bench 40/40 | преглед на живо (Q-059); D12 и скрити тестове с твой проект (чеклист 22–23) |
| 20 | E9в Gemini, local, роли по модел, Codex профил | phase/e9c-agents-2 | E8а | не е започната | 0/— | ключове/вход |
| 21 | E9г ресърч услуга | phase/e9d-research | E8д, E8к | не е започната | 0/— | ключове; златен набор |
| 22 | E9д учене | phase/e9e-learning | E9а | не е започната | 0/— | — |
| 23 | E9е подписани комити, revert, GitLab | phase/e9f-delivery-2 | E8ж | не е започната | 0/— | L4 |
| 24 | E9ж професионален десктоп + сайт | phase/e9g-desktop-pro | E7в, E7е | ГОТОВО (подпис, Windows/Linux и деплоят на сайта чакат Симо) (docs/reports/E9g.md) | AC-12.4–12.10 ✓ (12.8: Linux/Windows отложени); AC-12.1: dmg ✓, подпис чака | подписване, Windows/Linux от CI, деплой на сайта, десктопът на живо (чеклист 25–29) |
| 25 | E10 екипи и навсякъде | phase/e10-* | E9 | не е започната | 0/— | VPS, екип |
| 26 | E11 платформа | phase/e11-* | E10 | не е започната | 0/— | — |

## Текуща задача
Опростяване на UI/UX (docs/reports/ui-ux-simplify.md): фаза 1 готова (D-384) — три раздела, един вход за задача, без примери
и демо агенти по подразбиране, чист текст, свити менюта на десктопа, скрити dev команди. Фаза 2 готова (D-386) — една
страница за задача: присъда → промяна → бутони, „чака теб“ кехлибарено, „Пусни отново“ с бележка. Следват фаза 3 (първо
пускане) и фаза 4 (изтриване — чака Симо).
E7, E8, E9а, E9б и E9ж са готови (живите части — docs/setup/local-live-checklist.md). D-360: вид задача „Без ограничения“ (free).
D-368: `pnpm local`/десктоп без вход (само 127.0.0.1; Better Auth за профили по-късно).
D-369: вход в абонамент от „Акаунти“; D-370: страница „Система“ (doctor, images, fixtures, stats, verify-log).
E9ж (нощта 23→24.10.2026, клон phase/e9g-desktop-pro, docs/reports/E9g.md): десктопът със същия UI, мост със zod, менюта,
клавиши, tray брояч, известия, локален достъп по папки с права, „Приложи локално“, терминал на хоста, KEK в keychain,
самостоятелен dmg; сайтът apps/site с изтегляне и документация bg/en (D-371–D-379, Q-060–Q-066).
Чака Симо: проба на `pnpm desktop` и на dmg-а, подписване (docs/setup/signing.md), Windows/Linux от CI, деплой на сайта
(docs/setup/site.md, Q-064), отговори на Q-060–Q-066 (чеклист 25–29).
После: E9в — Gemini CLI, локален модел, роли по модел, Codex профил (+ каналът „review“ за съветника).

## Разход API: $0 (v5 бюджет ≤ $25, D-328)
