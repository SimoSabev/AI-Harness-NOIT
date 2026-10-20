# Спайк SH — Stop hook, който вика mandat-verify (демо промпт т. 7.6) — 20.10.2026

Не е вграден в демото. Файлове: spikes/sh/stop-hook.mjs, spikes/sh/claude-settings.example.json, spikes/sh/codex-hooks.example.json.

## Какво прави
Чете JSON от stdin; при `stop_hook_active: true` излиза 0 (не блокира два пъти поред); пуска
`mandat-verify --repo <cwd> --remote $MANDAT_SH_REMOTE --external --json`; при FAILED → exit 2 и причината на stderr
(Claude Code и Codex подават stderr на агента при exit 2 [Ф по документацията/кода, цитирани в т. 7.6]).

## Пуснато с fake вход (fake mandat-verify, без агент)
| Вход | Изход |
| --- | --- |
| FAILED | stderr „Mandat: FAILED — D2:missing_test:tests/cart.spec.ts > cart > applies 10% over 50. Fix the change; do not delete or weaken tests.“, exit 2 |
| VERIFIED | exit 0 |
| stop_hook_active: true | exit 0 (без проверка) |
| без MANDAT_SH_REMOTE/MANDAT_VERIFY_BIN | предупреждение на stderr, exit 0 |

С истински агент: SKIPPED (няма вход в Claude Code / Codex; docs/setup/external-agents.md).

## Изводи за продукта (след НОИТ)
- Hook-ът върви със същия uid като агента: агентът може да го изключи (`.claude/settings*.json` е в неговото дърво) —
  затова е само удобство; авторитетната присъда остава check run-ът на Observer и verifyd под отделен потребител.
- Проверката отнема ≈ 25–40 s на demo-shop; за Stop hook това е приемливо, за всеки ход — не.
- Безкраен цикъл е невъзможен: `stop_hook_active` + таванът на Claude Code (8).
