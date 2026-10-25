# S-SUB — абонамент на живо (v5 т. 3.1, D-295)

Статус (22.10.2026): **статичната половина ЗЕЛЕНА; живата SKIPPED — няма `mandat login` в облака**.

Статично (`packages/sandbox/src/sub-volume-isolation.test.ts`): ролите seed/install/export/test/gate не могат да монтират
volume-а на профила (rw или ro); агентът — само на PROFILE_DIR; друг volume на PROFILE_DIR → отказ.

Намерено при SH2 (D-342): днешният argv за абонамент съдържаше `--bare`, а bare режимът никога не чете OAuth данните
[Ф, docs/prd/research/anthropic.md ред 228, 22.10.2026] → входът в абонамент не би сработил. Поправено: каналът PROFILE
пуска Claude Code без `--bare` и със `--strict-mcp-config` (вариант B на SH2).

Живо (Симо): `pnpm mandat login --name lichno` → задача с агент `claude@lichno` → VERDICT VERIFIED; в лога на вратата само
`tunnel` редове към api.anthropic.com / console.anthropic.com / platform.claude.com:443 (кой хост ползва refresh — [НП],
записва се видяното). Командите: docs/setup/local-live-checklist.md, стъпка „S-SUB“.
