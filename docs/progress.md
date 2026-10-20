# Прогрес на E0

| Подфаза | Статус | Дата | Доклад |
| --- | --- | --- | --- |
| E0.1 Скелет на хранилището | ГОТОВО | 20.10.2026 | docs/reports/E0.1.md |
| E0.2а Пясъчник + gate + прокси + S0, S3 | ЧАСТИЧНО (S0 чака ключ) | 20.10.2026 | docs/reports/E0.2a.md |
| E0.2б Агенти, износ, `mandat run` + S1, S2 | ЧАСТИЧНО (claude, S1, S2 чакат ключ) | 20.10.2026 | docs/reports/E0.2b.md |
| E0.3а Проверка А/Б, D1–D4, присъда | ГОТОВО за fake; claude чака ключ | 20.10.2026 | docs/reports/E0.3a.md |
| E0.3б bench, redteam, README | ГОТОВО (bench 8/8, redteam 4/4); push блокиран | 20.10.2026 | docs/reports/E0.3b.md |

Клон: `claude/new-session-42gq0n` (D-141). Последен комит: `git log -1`.

## Нова сесия: откъде тръгваш
1. Прочети този файл, docs/reports/E0.3b.md и docs/decisions.md (D-139+ са новите решения).
2. `pnpm install --frozen-lockfile && pnpm check`; Docker: `pnpm mandat images build && pnpm mandat fixtures build && pnpm test:docker`.
   В облачна среда с TLS прихващане: `export MANDAT_EXTRA_CA_CERTS=<pem> MANDAT_SANDBOX_APT=0` (D-150, D-151).
3. Отворено: пускане с ключ (S0, S1, S2, live run), push (историята съдържа ключоподобни фалшиви литерали, D-149).
