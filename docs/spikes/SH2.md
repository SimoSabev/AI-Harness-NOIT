# SH2 — контролният слой на Claude Code (v5 т. 3.1, D-312)

Статус (22.10.2026, облачна сесия): **fake вариант ЗЕЛЕН; живият вариант SKIPPED — липсва ключ в проксито**
(`pnpm --silent mandat proxy status --json` → няма "state":"running"; v5 т. 0.5).

## Какво се сравнява
| | A | B |
| --- | --- | --- |
| argv | `claude --bare -p … --setting-sources user --settings /m/in/harness/claude/settings.json` | `claude -p … --setting-sources user --settings /m/in/harness/claude/settings.json --strict-mcp-config [--mcp-config …] --permission-mode dontAsk --permission-prompts none --disallowedTools …` |
| settings.json (ro, root, 0444) | `permissions.deny ["Bash(git push *)"]`, `hooks.PreToolUse → node /opt/mandat/hooks/deny-by-policy.mjs`, `pluginConfigs."cc-plugin-agents-md@builtin".options.instructionFiles = "managed-only"` | същото |
| вход в абонамент | **невъзможен** (bare не чете OAuth, D-342) | да (CLAUDE_CONFIG_DIR = volume-а на профила) |

Кодът: `packages/agents/src/claude/argv.ts` (`control: {variant, settingsFile, mcpConfigFile}`), `claude/control-layer.ts`
(`sh2Settings()`), куката `packages/agents/hooks/deny-by-policy.mjs` (в образа `/opt/mandat/hooks`, 0444), сийдърът
`apps/worker/src/harness-seed.ts` (`seedHarness` → `/m/in/harness`, файлове 0444/0555, папки 0555, root).

## Fake вариант (docker, реален изход)
`apps/worker/src/sh2.docker.test.ts` — за A и за B, fake агентът `sh2-probe` изпълнява куката от settings.json така, както
CLI-то би я изпълнило, и се опитва да промени контролния слой:
```
✓ SH2 control layer, variant A (fake agent) › hook blocks git push; the layer is read-only; the repo's control files are only tree files
✓ SH2 control layer, variant B (fake agent) › hook blocks git push; the layer is read-only; the repo's control files are only tree files
```
Доказано: куката излиза с 2 и причина „the harness delivers“, маркер в `/m/out/hooks.jsonl` (критерий 1 за механиката);
`permission_denied` се вижда в потока като `permission{denied}` (критерий 5 за механиката); запис в
`/m/in/harness/claude/settings.json`, `/m/in/harness/policy.json` и mkdir там → EACCES; `/opt/mandat/hooks` → EROFS;
след агента settings.json е непроменен; промяната на репо `.claude/settings.json` остава промяна в дървото (D3 я вижда).

## Живият вариант (чака Симо)
`node spikes/sh2-run.mjs` (≤ $0,40) печата за A и B: `c1_hook_ran`, `c2_repo_allow_ignored`, `c3_claude_md_not_read`,
`c4_repo_mcp_not_loaded`, `c5_push_denied`. [НП]: дали куките от изричен `--settings` се изпълняват под `--bare`
(документацията казва, че bare спира *автоматичното откриване* на куки; за изрично подадените не казва).

## Временно решение (D-343) до живия резултат
B за абонамент (задължително, D-342); A за ключ (днешният проверен път) + куките като защита в дълбочина. Инвариантът не зависи
от изхода: вратата (без мрежа извън маршрутите), D3 (контролни файлове), D4 (пътища) и износът спират същото и без куката.
Ако живият SH2 покаже, че A не пуска куката → ключът също минава на B (един ред в адаптера + snapshot).
