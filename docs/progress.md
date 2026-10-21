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

## Текуща задача
E6 (D-296–D-303): харнесът (без име засега) + Мандат (съдията); правила, дъска, канали и стълба в UI; 2 задачи наведнъж; промяната по
файл; мутационна проверка D11; pnpm/yarn/jest; проверка преди `pnpm local`; `pnpm desktop`. Следва: проба у Симо
(`pnpm local` или `pnpm desktop`, `pnpm mandat login`); monorepo/workspaces; yarn berry.

## Часове: план/реално по фаза
| Фаза | План [О] | Реално |
| --- | --- | --- |
| E1а | 4–5 | ≈ 2 |
| E1б | 44–56 | ≈ 6 |
| E1в | 25–34 | ≈ 3 |
| E2 | 17–23 | ≈ 2,5 |
| E3а | 34–44 | ≈ 4 |
| E3б | 20–27 | ≈ 3 |
| E3в | 23–29 | ≈ 4 |
| E3г | 9–12 | ≈ 2 |
| E4 | 26–36 | ≈ 5 |

## Разход API: $0
