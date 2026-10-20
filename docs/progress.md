# Прогрес (демо промпт за НОИТ; формат т. 1.5)

| Фаза | Клон | Статус | Последен комит | Дата | Чака Симо |
| --- | --- | --- | --- | --- | --- |
| E0 (E0.1–E0.3б) | claude/new-session-42gq0n | ГОТОВО (live чака Симо) | виж клона | 20.10.2026 | proxy start с ключ: S0, S1, S2, `run --agent claude` (docs/reports/E0.3b.md) |
| E1а лиценз и граници | phase/e1a-licenses | ГОТОВО (docs/reports/E1a.md) | `git log -1 phase/e1a-licenses` | 20.10.2026 | избор apache/dual (Q-017); docs/spec файловете (Q-018) |
| E1б ядро онлайн | phase/e1b-core-online | ГОТОВО (live чака Симо) (docs/reports/E1b.md) | `git log -1 phase/e1b-core-online` | 20.10.2026 | `supabase start` локално (Q-022, docs/blockers/supabase-start.md); Supabase облак (docs/setup/supabase.md); TSA live (docs/setup/tsa.md) |
| E1в врата GitHub | phase/e1c-github-gate | ГОТОВО (live чака Симо) (docs/reports/E1c.md) | `git log -1 phase/e1c-github-gate` | 20.10.2026 | GitHub App-ове, демо репо, live L1–L3 (docs/setup/github-apps.md, live-tests.md) |
| E2 MCP сървър | phase/e2-mcp | ГОТОВО (live чака Симо) (docs/reports/E2.md) | `git log -1 phase/e2-mcp` | 20.10.2026 | потребител `mandat` + verifyd (docs/setup/verifyd.md); вход в Claude Code/Codex (docs/setup/external-agents.md) |
| E3а inbox | phase/e3a-inbox | НЕ Е ЗАПОЧНАТА | — | — | — |
| E3б авто-харнес | phase/e3b-autoharness | НЕ Е ЗАПОЧНАТА | — | — | — |
| E3в канали | phase/e3c-channels | НЕ Е ЗАПОЧНАТА | — | — | — |
| E3г PWA | phase/e3d-pwa | НЕ Е ЗАПОЧНАТА | — | — | — |
| E4 демо | phase/e4-demo | НЕ Е ЗАПОЧНАТА | — | — | — |

Общо чака Симо: docs/spec (10 файла на спецификацията, т. 0.6; Q-018).

## Текуща задача
E3а (т. 8.1): клон phase/e3a-inbox; docs/tasks/e3a.md; daemon на worker-а (D-275) + apps/web (Next.js 16.3.8): inbox, дъска, карта.

## Часове: план/реално по фаза
| Фаза | План [О] | Реално |
| --- | --- | --- |
| E1а | 4–5 | ≈ 2 |
| E1б | 44–56 | ≈ 6 |
| E1в | 25–34 | ≈ 3 |
| E2 | 17–23 | ≈ 2,5 |

## Разход API: $0
