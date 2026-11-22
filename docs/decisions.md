# Решения (decisions)

D-001…D-138 са преписани от т. 4.2 на промпта v4 (20.10.2026) без промяна на смисъла. При конфликт D-031…D-138
имат предимство пред т. 5–13; между две решения важи по-големият номер. D-139+ са нови решения на кодера.
Формат: Решение / Защо / Алтернативи / Източник.

## D-001 Node 24.22.0 LTS (20.10.2026)
Решение: Node 24.22.0 LTS. Не 20 от спецификацията: vitest 5 иска ^22.12 || ^24, commander 15 иска ≥ 22.12, Claude Code иска ≥ 22.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-002 TypeScript 6.0.3, не 7.0.2 (20.10.2026)
Решение: TypeScript 6.0.3, не 7.0.2: typescript-eslint 8.71.2 изисква typescript < 6.1.0 (peerDependencies, registry, 20.10.2026).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-003 Правило за версии (20.10.2026)
Решение: Правило за версии: закрепва се най-новата версия, публикувана ≥ 3 дни преди 20.10.2026 (спецификацията: min_release_age_days 3). Затова claude-code е 2.1.302 (16.10), не 2.1.304 (19.10), и typescript-eslint е 8.71.2, не 8.72.0.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-004 Per-task токенът влиза като ANTHROPIC_API_KEY, НЕ като ANTHROPIC_AUTH_TOKEN (20.10.2026)
Решение: Per-task токенът влиза като ANTHROPIC_API_KEY, НЕ като ANTHROPIC_AUTH_TOKEN. Причина: headless документацията казва, че в bare режим Anthropic auth е ANTHROPIC_API_KEY или apiKeyHelper. За ANTHROPIC_AUTH_TOKEN в bare няма текст [НП]. ANTHROPIC_API_KEY се праща в `x-api-key`. Проксито приема и `x-api-key`, и `Authorization: Bearer`. Спайк S0 го потвърждава; резервът е apiKeyHelper.
Защо: headless документацията казва, че в bare режим Anthropic auth е ANTHROPIC_API_KEY или apiKeyHelper.
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-005 Egress gate = малък Node контейнер (20.10.2026)
Решение: Egress gate = малък Node контейнер (`packages/egress-gate`, node:http/https/dgram; 0 runtime зависимости извън workspace пакетите @mandat/contract и @mandat/redaction и техния zod/canonicalize; D-032), не nginx. Причини: allowlist-ът се смята от lockfile-а и фазата се сменя по време на задачата; логиката е на TS с unit тестове; DNS резолверът е в същия процес; журито чете наш код, не конфиг.
Защо: allowlist-ът се смята от lockfile-а и фазата се сменя по време на задачата; логиката е на TS с unit тестове; DNS резолверът е в същия процес; журито чете наш код, не конфиг.
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-006 Политиката на gate-а е файл policy.json в монтирана read-only ДИРЕКТОРИЯ (20.10.2026)
Решение: Политиката на gate-а е файл policy.json в монтирана read-only ДИРЕКТОРИЯ. Оркестраторът я сменя атомарно (write tmp + rename). Gate-ът я препрочита при промяна на mtime. Фази: install → agent → closed.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-007 npm ci става с мрежа през gate-а, без предварително изтеглен кеш в пясъчника (20.10.2026)
Решение: npm ci става с мрежа през gate-а, без предварително изтеглен кеш в пясъчника. Gate-ът кешира .tgz отговорите (200) на хоста в .mandat/cache/npm/ по sha256(път). npm проверява integrity от lockfile-а. Пясъчникът не вижда кеша, затова M15 „без споделени кешове в пясъчника“ остава в сила.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-008 LLM проксито е отделен контейнер `mandat-llm-proxy`, пуснат с `mandat proxy start` (20.10.2026)
Решение: LLM проксито е отделен контейнер `mandat-llm-proxy`, пуснат с `mandat proxy start`. Само тази команда чете ANTHROPIC_API_KEY от своя env. `mandat run` маха ANTHROPIC_API_KEY от своя process.env при старт (предупреждение на stderr) и никога не го подава нататък.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-009 Per-task токенът е безсъстоятелен HMAC (20.10.2026)
Решение: Per-task токенът е безсъстоятелен HMAC: mdt_<base64url(claims)>.<base64url(HMAC-SHA256(secret, claims))>. Тайната е в .mandat/proxy/secret (32 случайни байта, 0600) и се монтира в проксито. Оркестраторът я чете, за да издава токени. Отнемането (след износа) и броенето на разхода стават през admin API на проксито, публикуван само на 127.0.0.1.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-010 Всяка фаза е отделен `docker run --rm` върху общ Docker volume /m (20.10.2026)
Решение: Всяка фаза е отделен `docker run --rm` върху общ Docker volume /m: seed, install, agent, export, test. Без bind mount на записваеми директории в пясъчника (rootless uid mapping). Износът чете volume-а read-only в нов контейнер, след като агентските процеси са мъртви, затова TOCTOU от живи процеси няма.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-011 /etc/resolv.conf и /etc/hosts на пясъчника са наши файлове, монтирани read-only (20.10.2026)
Решение: /etc/resolv.conf и /etc/hosts на пясъчника са наши файлове, монтирани read-only. resolv.conf сочи DNS-а на gate-а, hosts съдържа egress-gate. Така собственият DNS вижда всяка заявка и логва dns_block. Ако Docker не го позволи, резервът е по спайк S3.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-012 fake:<сценарий> се изпълнява ВЪТРЕ в същия пясъчник като claude (20.10.2026)
Решение: fake:<сценарий> се изпълнява ВЪТРЕ в същия пясъчник като claude (`node /opt/mandat/fakes/<сценарий>.mjs`), със същия env и същия износ. Така bench и червеният отбор минават по реалния път без API ключ.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-013 Модел: claude-sonnet-5-5 (20.10.2026)
Решение: Модел: claude-sonnet-5-5 (ID от platform.claude.com/docs/en/about-claude/models/overview, 20.10.2026); ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-5-5. Проксито приема само моделите от ценовата таблица (т. 6.11).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-014 E0 няма .mandat.yml (20.10.2026)
Решение: E0 няма .mandat.yml. Нужната част от него е обект `repo_config` вътре в contract.json. config_hash = sha256(JCS(repo_config)).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-015 D4 пропуска файл, който D3 вече е хванал (20.10.2026)
Решение: D4 пропуска файл, който D3 вече е хванал (съвпада с protected_paths или е файл от protected_json_fields с променено защитено поле). Причина: спецификацията очаква `"test": "echo PASS"` → UNKNOWN (не FAILED) и R3 `.claude/settings.json` → UNKNOWN. Защитените пътища са „решава човек“, не „извън договора“.
Защо: спецификацията очаква `"test": "echo PASS"` → UNKNOWN (не FAILED) и R3 `.claude/settings.json` → UNKNOWN.
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-016 Износът отказва само пътища с компонент `.git` (20.10.2026)
Решение: Износът отказва само пътища с компонент `.git` (без значение от главни/малки букви) и `.gitmodules`/gitlink. `.gitattributes` и `.gitignore` минават към D3 (решение Ф6-4: `.gitattributes` → UNKNOWN).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-017 Tar при износа изключва само топ-ниво ./node_modules (20.10.2026)
Решение: Tar при износа изключва само топ-ниво ./node_modules. Останалото филтрира `git add -A` по .gitignore на head.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-018 Базовата линия е пускане на тестовете на base дървото (20.10.2026)
Решение: Базовата линия е пускане на тестовете на base дървото. Кешира се в .mandat/cache/baseline/<base_sha>-<64 hex>.json, където <64 hex> е hashJcs(repo_config.tests) БЕЗ префикса "sha256:" (двоеточието е невалидно в имена на NTFS / WSL /mnt/c). В базовата линия на fixtures/shop пада точно 1 тест (бъгът).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-019 Infra провал СЛЕД стъпка 7 на preflight (20.10.2026)
Решение: Infra провал СЛЕД стъпка 7 на preflight (т. 7.3; има run_id и task_created) — Docker, прокси, невалидна базова линия, install на base (E_INSTALL_BASE) или на A/B (E_INSTALL_TREE), политика на gate-а (E_GATE_POLICY) → присъда UNKNOWN с reason `infra:<код>`, ред verdict в дневника, exit 3. Агентът не е виновен, затова не е FAILED. Грешките в preflight стъпки 1–6 НЕ създават run и не пишат в дневника (D-038).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-020 Изтекъл task_minutes или budget_stop → агентът се спира (20.10.2026)
Решение: Изтекъл task_minutes или budget_stop → агентът се спира (docker stop -t 30). Без износ и проверка; присъда UNKNOWN (`agent:timeout` | `agent:budget_stop`).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-021 session.steering е изключен в E0 (20.10.2026)
Решение: session.steering е изключен в E0: задачата влиза като аргумент на `-p`, stdin е затворен. argv builder-ът поддържа и двата режима (unit тестове). Писане в stdin има само в спайк S2.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-022 Памет: изключена в E0 (20.10.2026)
Решение: Памет: изключена в E0 (`--disallowedTools mcp__*`). memory_snapshot в дневника е с snapshot_hash null. Блокът с данни в contract.txt е „(няма данни)“.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-023 `--allowedTools` и `--disallowedTools` се подават като ЕДИН argv елемент, списък (20.10.2026)
Решение: `--allowedTools` и `--disallowedTools` се подават като ЕДИН argv елемент, списък със запетаи (документирана форма: "Bash,Read,Edit"). Така variadic флагът не „поглъща“ текста на задачата. Текстът е непосредствено след `-p`, както в примерите в документацията. Че запетаите разделят правилно и правило с интервал и скоби, е [НП] → под-тест S0б (т. 13). Ако S0б не мине → `--allowedTools` става отделни argv елементи (по един на правило) преди `-p`; записва се в docs/decisions.md.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-024 Правило за Bash (20.10.2026)
Решение: Правило за Bash: `Bash(npx vitest *)` (с интервал преди *). Формата `Bash(npx vitest:*)` от спецификацията е ЕКВИВАЛЕНТНА (permissions: „The `:*` suffix is an equivalent way to write a trailing wildcard, so `Bash(ls:*)` matches the same commands as `Bash(ls *)` … only recognized at the end of a pattern“, https://code.claude.com/docs/en/permissions, 20.10.2026). Избираме формата с интервал, както в headless примерите.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://code.claude.com/docs/en/permissions, 20.10.2026

## D-025 Inventory ID на тест (20.10.2026)
Решение: Inventory ID на тест: "<файл спрямо корена на дървото> > <ancestorTitles, съединени с ' > '> > <title>", например "tests/cart.spec.ts > cart > applies 10% over 50". Не ползваме vitest fullName, защото е съединен с интервали.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-026 Изходни кодове (20.10.2026)
Решение: Изходни кодове: run → 0 VERIFIED, 10 UNKNOWN, 20 FAILED, 2 грешна употреба, 3 среда/infra, 5 невалиден договор, 130 Ctrl+C. verify-log/bench/redteam → 0 ок, 1 несъответствие, 2 грешна употреба, 3 среда/infra (D-128).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-027 Един `mandat run` наведнъж на MANDAT_HOME (20.10.2026)
Решение: Един `mandat run` наведнъж на MANDAT_HOME (lock файл .mandat/run.lock с pid; изтрива се, ако процесът е мъртъв).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-028 /tmp и HOME в пясъчника са tmpfs без noexec (20.10.2026)
Решение: /tmp и HOME в пясъчника са tmpfs без noexec (vitest/esbuild може да пишат изпълними файлове). Изолацията идва от read-only rootfs, cap-drop ALL и no-new-privileges. Опцията `exec` е изрична, защото Docker слага noexec по подразбиране (D-104).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-029 Docker тестовете са файлове *.docker.test.ts и се пускат отделно (20.10.2026)
Решение: Docker тестовете са файлове *.docker.test.ts и се пускат отделно (`pnpm test:docker`). Unit тестовете не искат Docker.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-030 GitHub Actions се закрепват по таг в E0 (20.10.2026)
Решение: GitHub Actions се закрепват по таг в E0 (checkout v7.0.1, setup-node v7.1.0, pnpm/action-setup v6.1.0; таговете съществуват, git ls-remote, 20.10.2026). Закрепване по пълен SHA идва в E1 заедно с M12. pnpm/action-setup е БЕЗ вход `version`: единственият източник е packageManager "pnpm@12.14.0" в package.json (README v6.1.0: „The version input can be omitted only when packageManager … declares pnpm v11 or newer“, https://raw.githubusercontent.com/pnpm/action-setup/v6.1.0/README.md, 20.10.2026). setup-node v7 не кешира pnpm по подразбиране, затова `cache: pnpm` е изрично (https://raw.githubusercontent.com/actions/setup-node/v7.1.0/README.md).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://raw.githubusercontent.com/pnpm/action-setup/v6.1.0/README.md; https://raw.githubusercontent.com/actions/setup-node/v7.1.0/README.md, 20.10.2026

## D-031 export/diff.patch се пази СУРОВ (20.10.2026)
Решение: export/diff.patch се пази СУРОВ (без redaction), защото е обектът под хеш (tree_sha, diff_hash, recompute, R6). CANARY (canary + per-task токен) се проверява В ПАМЕТТА веднага след износа, ПРЕДИ записа на diff.patch. При попадение: diff.patch НЕ се записва; пише се export/diff.redacted.patch (само exact redaction); проверката (VERIFY) се пропуска; присъдата е FAILED с "CANARY:in_diff:-" / "CANARY:token_in_diff:-" (+ canary_hit). writeRedacted() се ползва САМО за: логове, transcript.jsonl, notes.txt, agent-stderr.txt, evidence, security_events, verdict.json, ledger-payloads.jsonl, отчети и конзолен изход. ИЗРИЧНО без redaction (байтове под хеш или копия на дървета): export/diff.patch, git обектите и mirror-ите, копията на fixture, дърветата A/B, verify/report-*.json (те минават само през проверката за exact стойности — при попадение се заменят с {"redacted":true}), gate/policy/ policy.json и cache/baseline/*. Така R8(а) остава в сила, а честна промяна (вкл. base85 от --binary, дълги идентификатори) никога не става UNKNOWN заради redaction. Защо: принцип „хешираното не се пипа; тайната не стига до диска“.
Защо: принцип „хешираното не се пипа; тайната не стига до диска“.
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-032 GateRoute и GatePolicy са zod схеми в @mandat/contract (20.10.2026)
Решение: GateRoute и GatePolicy са zod схеми в @mandat/contract (src/gate.ts): `GateRouteSchema`, `GatePolicySchema`, `type GateRoute = z.infer<…>`. packages/channels и packages/egress-gate ги импортират оттам (channels не дефинира свой интерфейс). Образите на gate и proxy: multi-stage Dockerfile, build context = коренът на репото, `pnpm --filter @mandat/<pkg> --prod deploy /out` в build етапа (след `pnpm build`), финалният етап копира само /out (dist + prod node_modules с workspace пакетите). От v12.2.0 deploy не изисква injectWorkspacePackages (https://raw.githubusercontent.com/pnpm/pnpm/v12.14.0/pnpm/docs/cli/deploy.md, 20.10.2026). Пакетите трябва да имат "files": ["dist"]. Защо: един източник на типовете; без ръчно копиране на dist.
Защо: един източник на типовете; без ръчно копиране на dist.
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://raw.githubusercontent.com/pnpm/pnpm/v12.14.0/pnpm/docs/cli/deploy.md, 20.10.2026

## D-033 Липсващите сигнатури са в т (20.10.2026)
Решение: Липсващите сигнатури са в т. 6.14 и се пишат ТОЧНО така (контракт между пакетите). Типовете на данни (RunSpec, ErrorCode, RunHooks, …) са в @mandat/contract, ако се ползват от ≥ 2 пакета; иначе в пакета, посочен в 6.14.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-034 Docker режим и потребители (20.10.2026)
Решение: Docker режим и потребители. Режимът се открива с `docker info --format '{{json .SecurityOptions}}'` (съдържа "name=rootless" → rootless) и `docker info --format '{{.OperatingSystem}}'` ("Docker Desktop" → desktop); иначе rootful. Rootless: proxy и gate с `-u 0:0` и `--cap-drop=ALL` (uid 0 в контейнера = потребителят на хоста), така четат secret 0600 и пишат в .mandat/ като собственика. Rootful Linux (вкл. CI): proxy и gate с `-u $(id -u):$(id -g)`, за да не остават root-owned файлове в .mandat/. Docker Desktop: proxy и gate с `-u $(id -u):$(id -g)` като при rootful (D-080, D-119). Gate-ът не получава --cap-add, ако S3(ж) потвърди net.ipv4.ip_unprivileged_port_start=0; иначе само NET_BIND_SERVICE. Пясъчникът винаги е --user 1000:1000 (той не пише в bind mount-ове). Влиза в S3 като проба (з).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-035 fixtures/shop/src/money.ts (20.10.2026)
Решение: fixtures/shop/src/money.ts: `formatCents(c: number): string` → "12.34 EUR" (отрицателно "-12.34 EUR", 0 → "0.00 EUR"); `parseEuros(s: string): number` ("12.34" → 1234, "12" → 1200; всичко, което не съвпада с /^-?\d+(\.\d{1,2})?$/ → throw RangeError); `addCents(a: number, b: number): number`; `mulCents(c: number, qty: number): number` (qty не е цяло ≥ 0 → RangeError). cart.ts: subtotalCents хвърля RangeError при qty < 0 или priceCents < 0; тестовете "rejects …" проверяват `toThrow(RangeError)`.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-036 Възраст на версиите и за транзитивните зависимости (20.10.2026)
Решение: Възраст на версиите и за транзитивните зависимости: pnpm-workspace.yaml има `minimumReleaseAge: 4320` (минути = 3 дни; „This applies to all dependencies, including transitive ones“, https://raw.githubusercontent.com/pnpm/pnpm/v12.14.0/pnpm/docs/settings/dependency-resolution.md, 20.10.2026). Lockfile-ът на fixtures/shop се генерира с `npm install --before=2026-10-17 --registry=https://registry.npmjs.org/ --ignore-scripts` (npm `before`: „only versions that were available on or before the given date are installed“, https://raw.githubusercontent.com/npm/cli/v11.19.1/workspaces/config/lib/definitions/definitions.js, 20.10.2026); всички resolved са към https://registry.npmjs.org/ (иначе foreign_resolved).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://raw.githubusercontent.com/pnpm/pnpm/v12.14.0/pnpm/docs/settings/dependency-resolution.md; https://registry.npmjs.org/; https://raw.githubusercontent.com/npm/cli/v11.19.1/workspaces/config/lib/definitions/definitions.js, 20.10.2026

## D-037 Резервът на S3 за DNS (20.10.2026)
Решение: Резервът на S3 за DNS. Поправката на CVE-2024-29018 спира препращането на DNS от internal мрежи („patched to prevent forwarding DNS requests from internal networks“, https://github.com/moby/moby/security/advisories/GHSA-mq39-4gv4-mvpx, 20.10.2026), затова `--dns <gate ip>` в internal мрежа вероятно НЕ стига до gate-а [НП]. S3 проверява и резерва. Ако и той падне: остава само /etc/hosts с egress-gate (агентът не се нуждае от DNS: ANTHROPIC_BASE_URL и npm registry са на egress-gate); dns_block не се логва; p2 в R14 приема „няма ANSWER“.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://github.com/moby/moby/security/advisories/GHSA-mq39-4gv4-mvpx, 20.10.2026

## D-038 Грешки в preflight стъпки 1–6 (20.10.2026)
Решение: Грешки в preflight стъпки 1–6 (т. 7.3) не създават run, не пишат в ledger.jsonl/security_events.jsonl и излизат с exit 3 (E_DOCKER_VERSION, E_IMAGES_MISSING, E_PROXY_DOWN, E_MIRROR_MISSING, E_BASE_NOT_FOUND, E_GIT_VERSION). Изключения: невалиден договор → 5; зает lock и грешна употреба → 2. D-019 важи само след стъпка 7.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-039 Формат на INFRA/AGENT/EXPORT причините (20.10.2026)
Решение: Формат на INFRA/AGENT/EXPORT причините. INFRA и AGENT са evidence със status "unknown" и signature "INFRA:<КОД>:-" (КОД = ErrorCode без "E_", напр. "INFRA:INSTALL_BASE:-") / "AGENT:timeout:-" | "AGENT:budget_stop:-". Пълният reasons = [псевдоними, уникални по стойност, по реда на появата] ++ [signatures на fail в реда на evidence] ++ [signatures на unknown в реда на evidence]. Псевдоними: "infra:<код в малки букви без E_>" (напр. "infra:install_base", "infra:interrupted"), "agent:timeout" | "agent:budget_stop", "export:<ExportReasonCode>" (по един на код, дори при няколко пътя).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-040 `export interface RunHooks { beforeVerdict? (20.10.2026)
Решение: `export interface RunHooks { beforeVerdict?: (runDir: string) => Promise<void>; onCanary?: (value: string) => void }` е в apps/worker. Подава се САМО програмно на runTask() (т. 6.14); `mandat run` няма флаг за тях. `mandat redteam` импортира @mandat/worker и подава hook-овете в същия процес. „Не е достъпна от CLI“ = „няма флаг/env“.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-041 notes.txt (20.10.2026)
Решение: notes.txt: стъпка EXPORT 1б копира /m/out/notes.txt (≤ 1 MiB) в паметта на оркестратора; суровият текст се ползва само в паметта (CANARY; R8б и R14 парсват JSON от него); на диск отива само след writeRedacted. MANDAT_REPORT НЕ е в agent env и /m/out/agent-report.json не съществува в E0 (reportPath се маха от AgentRunContext).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-042 Кои SecurityEvent-и стават ред security_event в дневника (20.10.2026)
Решение: Кои SecurityEvent-и стават ред security_event в дневника: всички с severity warn|incident. redaction_hit (info) е най-много 1 агрегиран SecurityEvent на run (detail = брой по вид), записан в security_events.jsonl, БЕЗ ред в дневника. dns_block/proxy_block с еднакви (kind, qname|method+path) се агрегират в 1 събитие с detail.count.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-043 Тайни стойности (20.10.2026)
Решение: Тайни стойности (per-task токен, canary) никога не са в argv на docker CLI: подават се като `-e NAME` (само името), а стойността идва от env на процеса `docker` (spawn env). buildRunArgs() никога не получава стойности на тайни. Причина: argv се вижда в `ps`, в spawnargs на грешките на child_process и в snapshot тестовете (т. 11).
Защо: argv се вижда в `ps`, в spawnargs на грешките на child_process и в snapshot тестовете (т.
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-044 Смяна на политиката на gate-а (20.10.2026)
Решение: Смяна на политиката на gate-а: gate-ът проверява mtime на policy.json на всеки 100 ms; след успешно зареждане пише ред {"kind":"policy_loaded","phase","run_id","ts"} в events.jsonl. Оркестраторът след всяка смяна чака този ред (timeout 5 s → infra E_GATE_POLICY) и чак тогава пуска следващата фаза. Така няма фалшиви proxy_block.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-045 DNS на gate-а (20.10.2026)
Решение: DNS на gate-а: qname "egress-gate" (без значение от главни/малки, с/без крайна точка) + qtype A → IP от self-ip; "egress-gate" + друг qtype (AAAA, MX, …) → NOERROR без отговори (NODATA), без dns_block; всяко друго име, всеки qtype → NXDOMAIN + dns_block (агрегиран по qname, D-042). Липсва self-ip → SERVFAIL, без dns_block.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-046 npm в пясъчника (20.10.2026)
Решение: npm в пясъчника. Install env има изрично `npm_config_replace_registry_host=npmjs` (по подразбиране е "npmjs" и пренасочва dist URL-ите от https://registry.npmjs.org към конфигурирания registry; задаваме го изрично, за да не зависим от подразбиране; definitions.js на npm v11.19.1, https://raw.githubusercontent.com/npm/cli/v11.19.1/workspaces/config/lib/definitions/definitions.js, 20.10.2026). Agent env има `npm_config_update_notifier=false` и `npm_config_offline=true`, за да не прави `npx vitest` DNS/HTTP заявки към registry.npmjs.org.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://registry.npmjs.org; https://raw.githubusercontent.com/npm/cli/v11.19.1/workspaces/config/lib/definitions/definitions.js, 20.10.2026

## D-047 Имена и етикети на Docker обектите (20.10.2026)
Решение: Имена и етикети на Docker обектите: mandat-net-<run>-<agent|base|a|b>, mandat-gate-<run>-<agent|base|a|b>, mandat-vol-<run>-<agent|base|a|b>; агентът: mandat-agent-<run>. Label mandat.run=<run> на всички; mandat.role ∈ {seed, install, agent, export, test, gate}. `ensureUpstreamNetwork()` (идемпотентна; създава bridge mandat-upstream с label mandat.shared=1) се вика от `proxy start`, `run` и `doctor --deep`. sweepOrphans не трие mandat.shared.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-048 `doctor --deep` и тестовите контейнери (20.10.2026)
Решение: `doctor --deep` и тестовите контейнери. doctor --deep създава временен run "r_<ULID>" с MANDAT_HOME/runs/doctor-<ULID>/, политика phase "agent" и маршрутите на apiKeyChannel (без прокси: llm маршрутите дават 502), пуска fake r14-netprobe, НЕ пише в ledger.jsonl и security_events.jsonl, показва резултата и чисти (папката се трие освен при --keep). r14-netprobe.mjs и COPY на fakes/ в Dockerfile-а се правят в E0.2а. Docker тестът „gate→прокси→stub“: stub = образът mandat-llm-proxy с `node /opt/mandat/stub-upstream.mjs` (вграден в образа; файл, порт и поведение по D-117) в mandat-upstream с име mandat-test-stub-<id>; тестовото прокси е mandat-llm-proxy-test-<id> без publish; startGate() приема llmProxyUrl (по подразбиране http://mandat-llm-proxy:8787).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: http://mandat-llm-proxy:8787, 20.10.2026

## D-049 Usage poll (20.10.2026)
Решение: Usage poll: грешките на channel.usage() се игнорират (най-много 1 предупреждение на stderr на run). Verdict.usage = последната успешна стойност или нули. За fake без работещо прокси poll не се прави; токенът е минтван с mintTaskToken върху случаен ефимерен secret (валиден формат, проксито не го приема), така че redaction и CANARY:token_in_diff се упражняват и от fake сценариите.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-050 Детерминистичен `fixtures build` (20.10.2026)
Решение: Детерминистичен `fixtures build`: GIT_AUTHOR_NAME=GIT_COMMITTER_NAME="Mandat Fixtures", GIT_AUTHOR_EMAIL=GIT_COMMITTER_EMAIL=fixtures@mandat.invalid, дати GIT_AUTHOR_DATE=GIT_COMMITTER_DATE="@1792454400 +0000" (= 2026-10-20T00:00:00Z; вътрешният формат на git, D-133), message "fixture: shop\n"; копират се само 10-те файла от списъка в т. 7.1 (D-115; без node_modules/, .git, dist/), всички 0644, LF; `git -c core.fileMode=false -c core.autocrlf=false`. Съществуващ mirror със същия sha → no-op ("base_commit <sha> (unchanged)"); с различен sha → exit 3 с подсказка `--force` (тогава mirror-ът се пресъздава).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-051 fixtures/shop е ИЗВЪН pnpm workspace и извън root lint/typecheck/test/coverage/licenses (20.10.2026)
Решение: fixtures/shop е ИЗВЪН pnpm workspace и извън root lint/typecheck/test/coverage/licenses: pnpm-workspace.yaml packages: ["packages/*","apps/*","bench","spikes"]; vitest.config.ts, vitest.docker.config.ts и eslint.config.js игнорират fixtures/**; tsconfig.base/референциите не включват fixtures. Unit тест: `pnpm check` не вижда fixtures/shop/tests.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-052 Лицензи: SPDX изразите се оценяват — OR → достатъчна е една позволена алтернатива (20.10.2026)
Решение: Лицензи: SPDX изразите се оценяват — OR → достатъчна е една позволена алтернатива; AND → всички; скоби се спазват. Предварително одобрени devOnly изключения (в license-allowlist.json с причина): CC0-1.0, Python-2.0, CC-BY-4.0, Unlicense. Runtime (prod) зависимост извън allowlist-а → спиране и питане (т. 13). Командите са ДВЕ (D-077): `pnpm licenses list --json --recursive` (всички) и `pnpm licenses list --json --recursive --prod` (prod): от v12.7.0 без --recursive в корена се виждат само зависимостите на корена; `--prod` = „Check only `dependencies` and `optionalDependencies`“ (https://raw.githubusercontent.com/pnpm/pnpm/v12.14.0/pnpm/docs/cli/licenses.md, 20.10.2026). Форматът на JSON изхода не е проверен → записва се като фикстури fixtures/licenses/pnpm-12.14.0.json и fixtures/licenses/pnpm-12.14.0-prod.json при E0.1 (след D-076).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://raw.githubusercontent.com/pnpm/pnpm/v12.14.0/pnpm/docs/cli/licenses.md, 20.10.2026

## D-053 Тагове на образите (20.10.2026)
Решение: Тагове на образите (imageTags(), ползва се от `images build`, preflight и doctor): h12 = първите 12 hex на sha256 върху сортираните по път двойки "<POSIX относителен път>\0<sha256 hex на съдържанието>\n" за: Dockerfile-а на образа + всички файлове в build context-а му (src/ и package.json на пакета и на зависимите workspace пакети, pnpm-lock.yaml, packages/agents/fakes/ за sandbox) + root файловете package.json, pnpm-workspace.yaml, tsconfig.base.json, turbo.json и .dockerignore (D-078). Тагове: mandat-sandbox:cc2.1.302-<h12>, mandat-egress-gate:v<версия на пакета>-<h12>, mandat-llm-proxy:v<версия на пакета>-<h12>.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-054 MANDAT_HOME по подразбиране = <repo>/.mandat, където <repo> = три нива нагоре от (20.10.2026)
Решение: MANDAT_HOME по подразбиране = <repo>/.mandat, където <repo> = три нива нагоре от packages/cli/dist/main.js (import.meta.url), не cwd. MANDAT_PROXY_ADMIN_PORT (по подразбиране 8788) се чете от `proxy start`, `run` и `doctor`. MANDAT_SANDBOX_RUNTIME НЕ е в E0 (gVisor е извън обхвата).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-055 Ключът в env на проксито се вижда в `docker inspect` и в конфигурацията на конте (20.10.2026)
Решение: Ключът в env на проксито се вижда в `docker inspect` и в конфигурацията на контейнера на диска на хоста. Приема се за E0 и се записва в docs/security-e0.md като известна граница. E1: ключ в tmpfs файл, монтиран ro, с MANDAT_PROXY_KEY_FILE.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-056 Native binary-то на Claude Code се закрепва по integrity (20.10.2026)
Решение: Native binary-то на Claude Code се закрепва по integrity (без TOFU): пакетите @anthropic-ai/claude-code-linux-x64@2.1.302 (sha512-+d4RUq3E3K+3/J4MysB3z4QXA4rkDNt70VYpTLE6kJCnUe/Z6SB8VJsVJG/NV4bECrvkxkLHjXk+vrgBstfZkw==) и @anthropic-ai/claude-code-linux-arm64@2.1.302 (sha512-eRgp1cK2oSC7vK1/Dha9EsfSxNb6b/LyduzBxRW02c0X+C6xtyAzeGMmRobQSNuTazRxsr/Cf2/l4Sf/LMgxCA==) (https://registry.npmjs.org/@anthropic-ai%2fclaude-code-linux-x64/2.1.302 и …-linux-arm64/2.1.302, 20.10.2026; лиценз „SEE LICENSE IN LICENSE.md“). Dockerfile-ът избира по TARGETARCH, прави `npm pack` и сверява integrity.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://registry.npmjs.org/@anthropic-ai%2fclaude-code-linux-x64/2.1.302, 20.10.2026

## D-057 В agent env е и DISABLE_UPDATES=1 (20.10.2026)
Решение: В agent env е и DISABLE_UPDATES=1 („block all updates including manual claude update and claude install“, https://code.claude.com/docs/en/env-vars, 20.10.2026), освен DISABLE_AUTOUPDATER=1. CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY НЕ се задава (по подразбиране е изключен; тогава GET /v1/models не се праща и p8 в R14 остава валидна проба).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://code.claude.com/docs/en/env-vars, 20.10.2026

## D-058 Базовият образ се закрепва по digest на OCI индекса (20.10.2026)
Решение: Базовият образ се закрепва по digest на OCI индекса (многоархитектурен), не на платформен manifest. При E0.1: `docker buildx imagetools inspect node:24.22.0-bookworm-slim` и запис в docs/decisions.md.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-059 Entropy redaction по сегменти (20.10.2026)
Решение: Entropy redaction по сегменти: кандидатът [A-Za-z0-9+/_=-]{20,} се разделя на сегменти по "/"; allowlist-ът и entropy правилото се прилагат върху ВСЕКИ сегмент поотделно (сегмент < 20 знака не е кандидат). Така пътища като ".mandat/runs/r_<ULID>/verdict.json" и тагове "mandat-sandbox:cc2.1.302-<h12>" не се редактират.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-060 r8-keyscan сканира само префиксните regex-и от т (20.10.2026)
Решение: r8-keyscan сканира само префиксните regex-и от т. 8.4 (без entropy, без mdt_ и без canary-то); пропуска /m/work/node_modules и файлове > 1 MB; в notes пише само вид + път, никога стойност. Очакване hits = 0.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-061 Износ: нов ExportReasonCode "unreadable" (20.10.2026)
Решение: Износ: нов ExportReasonCode "unreadable" (tar в контейнера излиза с exit ≠ 0, напр. файл с chmod 000) → ExportRejection, path = първият път от stderr на tar или "-" → FAILED. max_files се отнася за ПРОМЕНЕНИТЕ файлове (редовете на `--name-status`). За too_many_files, diff_too_large, tar_too_large path = "-".
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-062 transcript.jsonl = суровите stdout редове на агента след redactJson (20.10.2026)
Решение: transcript.jsonl = суровите stdout редове на агента след redactJson (структурата се пази); неJSON редовете минават през redactText и се пишат като {"raw":"<текст>"}. AgentEvent е само за конзолата и usage. S0 фикстурата е в същия формат.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-063 Verdict.timings_ms остава z.record с enum ключ (20.10.2026)
Решение: Verdict.timings_ms остава z.record с enum ключ (в zod 4 е изчерпателен): всичките 7 ключа винаги присъстват; непусната фаза има 0.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-064 VerifyResult.firstBadSeq = ОЧАКВАНИЯТ seq (20.10.2026)
Решение: VerifyResult.firstBadSeq = ОЧАКВАНИЯТ seq (= номерът на реда, seq започва от 1), независимо от записаната стойност. null само при E_PARSE на ред, чийто номер не може да се изведе (в E0 не се случва, защото ред = seq). Property генераторът гарантира, че мутацията сменя стойността. Уточнение (E_SEQ_GAP): при изтрит ред k на позиция k стои записът със seq k+1 → firstBadSeq = k, line = k, countOk = k−1, expected = "k", actual = "k+1" (actual = записаната стойност). Пример: изтрит ред 2 → {ok:false, code:"E_SEQ_GAP", firstBadSeq:2, line:2, countOk:1, expected:"2", actual:"3"}.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-065 scripts/check-no-dotenv.mjs търси само (20.10.2026)
Решение: scripts/check-no-dotenv.mjs търси само: (1) низови литерали по regex /["'`](?:[^"'`]*\/)?\.env(?:\.[\w.*-]+)?["'`]/; (2) /\bdotenv\b/ в import/require и в package.json зависимости. Обхват packages/** и apps/**; allowlist: ".env.test*" в packages/core/**/*.test.ts и fixtures/contracts/**. Скриптът има собствен unit тест.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-066 Bind mount правило за пясъчника (20.10.2026)
Решение: Bind mount правило за пясъчника: забранено е source == $HOME, source предшественик на $HOME, всеки rw bind и docker.sock. Позволени са само ro bind mount-ове на ФАЙЛОВЕ под `${ctx.runDir}/etc/` (resolv.conf, hosts; при тестовите дървета etc/<x>/, D-081); ctx.runDir е абсолютен път под <MANDAT_HOME>/runs/ (D-082). Volume-ите (kind "volume") са позволени. Тестът на buildRunArgs покрива трите случая. Bind mount-овете на role "gate" (директории) са изброени точно в D-118.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-067 vitest.docker.config.ts дефинира projects с name = името на пакета без scope (20.10.2026)
Решение: vitest.docker.config.ts дефинира projects с name = името на пакета без scope ("sandbox", "egress-gate", "worker", "bench") и fileParallelism: false (run.lock). Командите са `pnpm test:docker --project <име>` без `--`. Кой тест в кой project: D-132.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-068 costUsd: ако usage има cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_i (20.10.2026)
Решение: costUsd: ако usage има cache_creation.{ephemeral_5m_input_tokens, ephemeral_1h_input_tokens}, се ползва разбивката с двете тарифи и cache_creation_input_tokens се игнорира; ако има само общото, то се таксува като 5m.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-069 Машинният изход (20.10.2026)
Решение: Машинният изход (--json) и CLI подробностите са по т. 6.13 (схемите там са задължителни).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-070 CANARY още в E0.2б (20.10.2026)
Решение: CANARY още в E0.2б. packages/core се създава в E0.2а само със src/r14.ts (D-073, за doctor --deep); в E0.2б се добавят src/canary.ts и src/signature.ts (+ тестовете „CANARY“ и „signature нормализация“ от т. 9.4); останалите файлове на core идват в E0.3а. В E0.2б evidence е EXPORT, INTEGRITY, CANARY, PLACEHOLDER (в този ред; статусът на PLACEHOLDER по D-109). При CANARY pass reasons = ["PLACEHOLDER:not_implemented:E0.3"] (тестът на ходещия скелет не се променя); при попадение важи D-071 (FAILED още в E0.2б). Защо: в E0.2б diff.patch вече се пише на диск и минава реалният Claude; D-031 („тайната не стига до диска“) трябва да важи от първия запис.
Защо: в E0.2б diff.patch вече се пише на диск и минава реалният Claude; D-031 („тайната не стига до диска“) трябва да важи от първия запис.
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-071 CANARY: обхват и signature (20.10.2026)
Решение: CANARY: обхват и signature. canaryCheck търси стойността на canary-то и на per-task токена в суровия diff И в суровите notes (в паметта). Всяко попадение (в дифа или в notes) → CANARY fail, VERIFY се пропуска (D1, D2, D3, D4, MUST_PASS = n/a), security_event canary_hit (warn, source "export"), FAILED. Файлове: дифът е чист → пише се СУРОВ export/diff.patch (дори ако попадението е само в notes); дифът съдържа тайна → пише се само export/diff.redacted.patch. Signature = първото попадение по реда [canary в дифа → "CANARY:in_diff:-"; токен в дифа → "CANARY:token_in_diff:-"; canary в notes → "CANARY:in_notes:-"; токен в notes → "CANARY:token_in_notes:-"]; data.hits изрежда ВСИЧКИ попадения: [{"secret":"canary"|"token","where":"diff"|"notes"}]. Един canary_hit на run с detail {"hits":n,"first":"<клас>"}.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-072 r8-keyscan записва в notes и {"anthropic_api_key_prefix" (20.10.2026)
Решение: r8-keyscan записва в notes и {"anthropic_api_key_prefix": "<първите 4 знака на $ANTHROPIC_API_KEY>"}. Пълният формат: {"hits":N,"examples":[{"kind","path"}],"anthropic_api_key_prefix":"mdt_"}. Тестът проверява hits === 0 и anthropic_api_key_prefix === "mdt_". Стойността на токена никога не се пише (иначе CANARY я хваща в notes, D-071).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-073 R14: формат и оценка (20.10.2026)
Решение: R14: формат и оценка. r14-netprobe пише в notes ЕДИН JSON обект: {"probes":[{"id":"p1".."p8","cmd":string, "exit":number,"http_code":string|null,"dns_status":string|null,"dns_answers":number|null}]} (8 елемента, по реда p1..p8; http_code е изходът на `-w '%{http_code}'` или null; dns_status е стойността след "status: " в реда ";; ->>HEADER<<-" на dig или "timeout", ако няма такъв ред; dns_answers е "ANSWER: n" или null). Fake-ът НЕ решава „blocked“. Решава хостът с ЕДНА чиста функция в @mandat/core (src/r14.ts): `evaluateR14(notesRaw: string, gateLog: GateLogLine[], o: { dnsMode: "gate" | "hosts_only" }): { blocked: number; total: 8; probes: { id: string; blocked: boolean; why: string }[] }`, ползвана и от `doctor --deep`, и от redteam. Условия: p1, p3, p4, p5: exit ≠ 0. p2: dns_answers ∈ {0, null} И (dnsMode "hosts_only" ИЛИ gateLog ∋ dns_block с qname "evil.example"). p6: (http_code === "403" ИЛИ exit ≠ 0) И gateLog ∋ proxy_block с method "CONNECT". p7: http_code "403" И gateLog ∋ proxy_block PUT /npm/left-pad. p8: http_code "403" И gateLog ∋ proxy_block GET /v1/models. Невалиден JSON или липсваща проба → тази проба blocked=false, why "notes_invalid". dnsMode е константа DNS_MODE в @mandat/sandbox/src/network.ts, зададена по резултата от S3 (D-037).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-074 INTEGRITY след проверката (20.10.2026)
Решение: INTEGRITY след проверката (R6) ЗАМЕНЯ съществуващото INTEGRITY evidence (в evidence остава точно едно INTEGRITY): status "unknown", signature "INTEGRITY:mismatch:post_verify", source "worker"; Verdict.integrity = "mismatch"; SecurityEvent tree_mismatch (incident, source "worker") → и ред security_event в дневника (D-042).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-075 Ред „redact → hash → write“ за всичко, което има хеш в дневника (20.10.2026)
Решение: Ред „redact → hash → write“ за всичко, което има хеш в дневника: обектът (payload, verdict, detail) минава през redactJson; hashJcs се смята върху РЕДАКТИРАНИЯ обект; записва се същият обект (writeRedacted е идемпотентен, затова повторната redaction не го променя). payload_hash = hashJcs(редактиран payload); verdict_hash = hashJcs(редактиран verdict) = съдържанието на verdict.json; detail_hash = hashJcs(редактиран detail). Unit тест: за всеки ред на ledger-payloads.jsonl hashJcs(row.payload) === payload_hash на реда в ledger.jsonl.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-076 packages/export започва в E0.1 само с src/clean-git.ts, src/index.ts и тест „чист git (20.10.2026)
Решение: packages/export започва в E0.1 само с src/clean-git.ts, src/index.ts и тест „чист git: attr.tree“ и с декларирана runtime зависимост tar 7.5.22 (още неползвана). tar-scan.ts, export.ts, recompute.ts, lockfile.ts идват в E0.2б. Фикстурите на `pnpm licenses list` се записват СЛЕД като пакетът е създаден.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-077 Лицензи по prod/all списъци (20.10.2026)
Решение: Лицензи по prod/all списъци. check-licenses пуска двете команди от D-052. Пакет (name@version) от prod списъка трябва да е в allowed (изключенията НЕ важат за него). Пакет само в списъка „всички“ (= dev) минава, ако лицензът му е в allowed или има изключение по ЛИЦЕНЗ. license-allowlist.json: {"allowed":["MIT",…т. 4.1…],"exceptions":[{"license":"CC0-1.0","reason":"…","devOnly":true}, …Python-2.0, CC-BY-4.0, Unlicense]}. SPDX изразът се оценява по D-052 срещу allowed ∪ (exceptions, ако пакетът е dev).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-078 .dockerignore в корена (20.10.2026)
Решение: .dockerignore в корена (E0.2а): `.mandat`, `**/node_modules`, `**/dist`, `coverage`, `.git`, `.env`, `.env.*`, `!.env.example`, `*.tgz`. Така тайната (.mandat/proxy/secret), дневникът и runs/ никога не са в build context-а. Build етапът на gate/proxy се казва `build` с WORKDIR /src. Docker тест (E0.2а): създава .mandat/sentinel, `docker build --target build -t mandat-ctx-check -f docker/egress-gate/Dockerfile .` → `docker run --rm mandat-ctx-check test ! -e /src/.mandat` → exit 0; образът се трие. h12 включва root файловете (D-053).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-079 Инсталация на Claude Code в mandat-sandbox (20.10.2026)
Решение: Инсталация на Claude Code в mandat-sandbox (т. 8.3). Проверено в tarball-а 2.1.302 (https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.302.tgz, 20.10.2026): bin/claude.exe е 500-байтов shell stub; postinstall `node install.cjs` намира native пакета с `require.resolve("@anthropic-ai/claude-code-linux-<arch>/package.json")` и го слага (hardlink/копие) върху bin/claude.exe. Затова скриптовете остават разрешени. require.resolve от …/node_modules/@anthropic-ai/claude-code/ стига и до съседния глобален пакет …/node_modules/@anthropic-ai/claude-code-linux-<arch>. Команда: `npm install -g --offline --omit=optional ./anthropic-ai-claude-code-linux-<arch>-2.1.302.tgz ./anthropic-ai-claude-code-2.1.302.tgz` (npm v11.19.1 definitions.js: offline = „no network requests will be done during install“; omit: „these dependencies _are_ still resolved … just not physically installed“, https://raw.githubusercontent.com/npm/cli/v11.19.1/workspaces/config/lib/definitions/definitions.js, 20.10.2026). Че resolve на останалите 7 optional пакета при --offline не чупи install-а, е [НП]: проверява се при първия `images build` (E0.2а). Критерий: build минава и `claude --version` съдържа 2.1.302. Резерв (без STOP): ръчно разархивиране — `tar -xzf` на двата tgz в /usr/local/lib/node_modules/@anthropic-ai/claude-code и …/claude-code-linux-<arch> (--strip-components=1), `node /usr/local/lib/node_modules/@anthropic-ai/claude-code/install.cjs`, `ln -s ../lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe /usr/local/bin/claude`; записва се. `ARG CLAUDE_CODE_INTEGRITY` се декларира със стойността от т. 4.3. pnpm в build етапите на gate/proxy: `npm i -g pnpm@12.14.0` (само в build етапа; финалният образ не съдържа pnpm).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.302.tgz; https://raw.githubusercontent.com/npm/cli/v11.19.1/workspaces/config/lib/definitions/definitions.js, 20.10.2026

## D-080 Docker Desktop (20.10.2026)
Решение: Docker Desktop: gate с `--user $(id -u):$(id -g)` (както rootful). Че файловете в .mandat/, писани от gate-а през bind mount, излизат като потребителя на хоста, е [НП] → проба S3(з); несъответствие → СПРИ (т. 13).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-081 Отделни файлове за всеки gate (20.10.2026)
Решение: Отделни файлове за всеки gate. Агентският gate запазва gate/policy/, gate/log/events.jsonl, etc/resolv.conf, etc/hosts. За x ∈ {base, a, b}: gate/<x>/policy/{policy.json,self-ip}, gate/<x>/log/events.jsonl, etc/<x>/resolv.conf, etc/<x>/hosts (под etc/ → позволени по D-066). proxy_block/dns_block от тези логове стават SecurityEvent по D-042 (source "gate", detail.tree = "<x>").
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-082 buildRunArgs получава ctx { home, mandatHome, runDir } (20.10.2026)
Решение: buildRunArgs получава ctx { home, mandatHome, runDir } (runDir = абсолютен път под <mandatHome>/runs/, иначе E_FORBIDDEN_DOCKER_FLAG). Позволеното ro поддърво е `${runDir}/etc/`. Worker-ът подава runs/<run_id>, doctor --deep подава runs/doctor-<ULID> (D-048). Тестът покрива и двата случая.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-083 Контейнерите на проксито (20.10.2026)
Решение: Контейнерите на проксито (истинско, тестово, stub) се строят с отделна чиста функция buildProxyRunArgs (т. 6.14) в sandbox/hardening.ts, НЕ с buildRunArgs. Тя позволява само `-p 127.0.0.1:<port>:8788` (или без publish) и хвърля E_FORBIDDEN_DOCKER_FLAG при --privileged, docker.sock, --network host и стойност на тайна в argv. Snapshot тест.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-084 Env на процеса docker (20.10.2026)
Решение: Env на процеса docker: dockerSpawnEnv(process.env, o.env) = подбраните ключове PATH, HOME, DOCKER_HOST, DOCKER_CONTEXT, DOCKER_CONFIG, DOCKER_CERT_PATH, DOCKER_TLS_VERIFY, XDG_RUNTIME_DIR от process.env (само ако съществуват), обединени с o.env (o.env печели). Нищо друго не се наследява. o.env съдържа САМО стойностите на тайните; публичните стойности на контейнера са в argv като `-e NAME=value` (RunSpec.publicEnv, D-105). ANTHROPIC_API_KEY влиза само ако е в o.env (единствено при `proxy start`). Unit тест с fake process.env.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-085 Пускане на CLI с машинен изход (20.10.2026)
Решение: Пускане на CLI с машинен изход. Docker тестовете пускат `node packages/cli/dist/main.js …` директно. В README и ръчно с --json: `pnpm --silent mandat … --json`. НЕ `pnpm -s`: при `pnpm run` в v12 `-s` е `--sequential`; „The long form `--silent` is unaffected in all commands“ (https://raw.githubusercontent.com/pnpm/pnpm/v12.14.0/pnpm/docs/cli/run.md, 20.10.2026). Че `--silent` маха банера „> mandat@… mandat“, е [НП] → тест в E0.1 (т. 9.1, „pnpm --silent --json“); не мине → README ползва `node packages/cli/dist/main.js … --json`; записва се.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://raw.githubusercontent.com/pnpm/pnpm/v12.14.0/pnpm/docs/cli/run.md, 20.10.2026

## D-086 Пакетът spikes (20.10.2026)
Решение: Пакетът spikes (private: true, не се разпространява) има @modelcontextprotocol/sdk 1.32.1 като dependency (не dev), за да влезе в `pnpm --filter spikes --prod deploy`. Лицензите на транзитивните му зависимости се проверяват от check-licenses като prod; извън allowlist-а → спиране (т. 13). Образ docker/spike-mcp/Dockerfile: FROM node:24.22.0-bookworm-slim@<digest от т. 4.3> AS build; WORKDIR /src; COPY . .; `npm i -g pnpm@12.14.0`; `pnpm install --frozen-lockfile`; `pnpm --filter spikes --prod deploy /out`; финален етап със същата основа, COPY --from=build /out /opt/spike; USER 1000:1000; CMD ["node","/opt/spike/s1-mcp-server.mjs"]. Таг mandat-spike-mcp:local.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-087 Спайковете S0–S2 се пускат през spikes/harness.mjs (20.10.2026)
Решение: Спайковете S0–S2 се пускат през spikes/harness.mjs (E0.2а), не през `mandat run`. Той импортира @mandat/sandbox, @mandat/egress-gate, @mandat/channels, @mandat/contract и @mandat/agents (само argv) и прави: временен run по модела на D-048 (runs/spike-<ULID>/, run_id "r_<ULID>"), seed + contract.txt (S0 в E0.2а: /m/work само с README.md и contract.txt от renderAgentContract(contractForAgent(fixtures/contracts/sample.json)); S1/S2 в E0.2б: fixtures/shop и contracts/fix-discount.json), политика phase "agent", пускане на агентския контейнер и опционални hooks {extraHosts: string[]; extraNetworkMember?: { container: string; alias: string }; argv: string[]; stdin: "closed" | "pipe"; onStdoutLine?(line): void}. НЕ пише в ledger.jsonl и security_events.jsonl. buildClaudeArgv (packages/agents/ src/claude/argv.ts + тестовете „argv …“ от т. 9.3) се изтегля в E0.2а. Скриптове: spikes/s0-run.mjs, s1-run.mjs, s2-run.mjs.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-088 `mandat doctor` (20.10.2026)
Решение: `mandat doctor`: спряно прокси е информация, не грешка: ред "llm-proxy: not running (needed only for --agent claude)", exit 0. Exit 3 само ако проксито върви, но healthz пада ("llm-proxy: running, healthz fail").
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-089 Бюджет в проксито (20.10.2026)
Решение: Бюджет в проксито: заявка се отказва (403 budget_exhausted), ако spent ≥ b ПРЕДИ нея. TaskUsage.budgetStop = true от момента, в който spent ≥ b (без да чака отказ), за да спре worker-ът агента при следващия poll. SecurityEvent budget_stop: severity "warn", source "proxy" → и ред security_event в дневника.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-090 redteam: "pass" и "total" броят АТАКИТЕ (20.10.2026)
Решение: redteam: "pass" и "total" броят АТАКИТЕ (total = 4 при пълен run; при --only = броя избрани). Атака минава, когато всичките ѝ под-тестове са ok. rows е по под-тест (7 реда: R5×3, R6×1, R8×2, R14×1). Текстовият изход е по ред на под-тест; последният ред е "RESULT <pass>/<total>"; exit 0 само при pass === total.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-091 Крайните случаи от т (20.10.2026)
Решение: Крайните случаи от т. 7.11 се тестват като worker unit тестове с fake docker runner (подготвен tar поток, exit кодове и отчети), с имена „edge: …“ по реда на т. 7.11 (т. 9.3 и т. 9.4). Нов FakeScenario не се добавя.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-092 Безопасно четене от volume-а (20.10.2026)
Решение: Безопасно четене от volume-а (notes и отчети). Командата е `sh -c 'F=<път>; test -f "$F" && ! test -L "$F" && head -c <лимит> "$F"'` в контейнер с пълния sandboxHardening, роля "export" (notes) / "test" (отчети), --network none, `-v <vol>:/m:ro`, timeoutMs 30 000. Лимит: notes 1048576; отчет 20971521 (> 20 MB → too_large). Exit ≠ 0, timeout или не-обикновен файл (FIFO, symlink, директория) → notes = "" / отчетът е null (→ report_invalid:missing). Защо: FIFO блокира `cat`/`head` безкрайно.
Защо: FIFO блокира `cat`/`head` безкрайно.
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-093 Списъкът с файлове (20.10.2026)
Решение: Списъкът с файлове: `git -c core.quotePath=false diff --cached --name-status -M -z` и разбор по NUL (R/C: "R<score>\0<old>\0<new>\0"). git docs: -z „do not munge pathnames and use NULs as output field terminators“ (https://raw.githubusercontent.com/git/git/master/Documentation/diff-options.adoc, 20.10.2026); без него core.quotePath цитира байтове > 0x80 с октални escape-и (config/core.adoc). ChangedFile.path е суровият UTF-8 низ.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://raw.githubusercontent.com/git/git/master/Documentation/diff-options.adoc, 20.10.2026

## D-094 Хранилище или MANDAT_HOME на /mnt/<буква>/ под WSL (20.10.2026)
Решение: Хранилище или MANDAT_HOME на /mnt/<буква>/ под WSL (DrvFs) НЕ се поддържа (chmod 0600 на тайната и mtime polling не са надеждни). doctor и preflight стъпка 4: /proc/version съдържа "microsoft" (без значение от регистъра) И realpath(MANDAT_HOME) или repoRoot започва с /mnt/<буква>/ → грешка E_UNSUPPORTED_FS с message „клонирай в WSL файловата система (~/)“, exit 3. README казва същото.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-095 Фалшиви ключове в тестовете не са литерали (20.10.2026)
Решение: Фалшиви ключове в тестовете не са литерали: сглобяват се по време на изпълнение (напр. ["sk", "ant", "api03", gen(40)].join("-")) или се четат от fixtures/redaction/corpus.json. .gitleaks.toml: `[extend] useDefault = true` + `[[allowlists]] description = "redaction corpus" paths = ['''^fixtures/redaction/''']` (синтаксис от v8.25.0: „`[allowlist]` was replaced with `[[allowlists]]`“, https://raw.githubusercontent.com/gitleaks/gitleaks/v8.30.1/README.md, 20.10.2026). Други пътища в allowlist-а не се добавят.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://raw.githubusercontent.com/gitleaks/gitleaks/v8.30.1/README.md, 20.10.2026

## D-096 Резерв S3(д) (20.10.2026)
Решение: Резерв S3(д) (само ако S3(д) падне): RunSpec.capAdd става ("NET_BIND_SERVICE" | "CHOWN")[]; CHOWN е позволен САМО за role "seed" с network "none"; buildRunArgs и тестът „buildRunArgs: забранени“ се обновяват (CHOWN за друга роля → E_FORBIDDEN_DOCKER_FLAG). Без активиран резерв типът остава "NET_BIND_SERVICE"[].
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-097 Кеш на базовата линия (20.10.2026)
Решение: Кеш на базовата линия: файлът съдържа СУРОВИЯ vitest JSON отчет на base (байтовете, само exact проверката по D-031). При четене минава отново през parseVitestReport(raw, "/m/work"); невалиден → файлът се трие и тестовата процедура за base се пуска наново.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-098 runTestProcedure (20.10.2026)
Решение: runTestProcedure (т. 6.14) се прави в E0.2б в apps/worker/src/phases/test.ts. В E0.2б я ползват само двата docker теста „base пада точно с 1 тест“ и „ръчната фикстура = истинския отчет“; детекторите и VERIFY са в E0.3а.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-099 Изход на CLI командите при успех и повторение (20.10.2026)
Решение: Изход на CLI командите при успех и повторение (т. 6.13): contract seal, proxy start, images build, fixtures build.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-100 Ред в matchPolicy (20.10.2026)
Решение: Ред в matchPolicy (т. 6.8): CONNECT → connect; phase closed → phase_closed; махане на query; ТОЧНО съвпадение (method, path) → allow; пътят съдържа "..", "//", "%2e" или "%2f" (без значение от регистъра) → bad_path; prefix съвпадение → allow; иначе no_route. Отклонение от предложението „exact или prefix → allow преди bad_path“: prefix маршрут не бива да пуска "/npm/../x". Scoped маршрутите с %2f/%2F са exact, затова минават.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-101 renderAgentContract (20.10.2026)
Решение: renderAgentContract: разделителят в allowed_paths е ", " (запетая + интервал); всеки ред завършва с LF; файлът завършва с точно един LF (без празен ред в края). Snapshot тест за fixtures/contracts/sample.json.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-102 signature(detector, cls, id) (20.10.2026)
Решение: signature(detector, cls, id): в id CR, LF и TAB стават интервал, после trim; празен id → "-". Ако `${detector}:${cls}:${id}` е > 300 знака, id се реже така, че целият низ да е 299 знака + "…" (300 общо). Регистърът не се променя.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-103 D2 при няколко попадения (20.10.2026)
Решение: D2 при няколко попадения. Проверките вървят във ФИКСИРАН ред: report_invalid → zero_tests → only → missing_test → skipped → exit_mismatch. При невалиден B се пускат само report_invalid и only (only чете само diff-а); иначе всички. data.findings = ВСИЧКИ попадения [{"cls","id"}] в този ред (в един клас: ID-тата по реда на baseline.tests, файловете по реда на diff.patch). Клас: missing_test е "unknown" при may_change_tests, всяко друго попадение е "fail". status = "fail", ако има fail попадение; иначе "unknown" (само missing_test при may_change_tests); иначе "pass". signature = първото попадение по реда, чийто клас е равен на status. Защо: при CI=true `.only` чупи целия файл (allowOnly: !isCI, т. 4.5) и тестовете му липсват в B; без фиксиран ред missing_test би изпреварил only и B8 би дал MISMATCH. Unit тест „D2 only печели пред missing“ (т. 9.4).
Защо: при CI=true `.only` чупи целия файл (allowOnly: !isCI, т.
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-104 tmpfs в пясъчника е с изрично `exec` (20.10.2026)
Решение: tmpfs в пясъчника е с изрично `exec`. Docker слага на всеки --tmpfs по подразбиране "noexec","nosuid","nodev" и после добавя опциите на потребителя; MergeTmpfsOptions обхожда отзад напред и по-късната опция за същия флаг печели (moby daemon/oci_linux.go: `options := []string{"noexec", "nosuid", "nodev", …}` + `mount.MergeTmpfsOptions(options)`, https://raw.githubusercontent.com/moby/moby/master/daemon/oci_linux.go; moby/sys mount/flags_unix.go: "exec" и "noexec" са един флаг NOEXEC, https://raw.githubusercontent.com/moby/sys/main/mount/flags_unix.go; 20.10.2026). Без `exec` D-028 не се изпълнява. Затова двете опции в т. 8.2 са `rw,exec,nosuid,nodev,…`. tmpfs на проксито (т. 8.1) остава без exec. Проверка на живо: S3(и) и docker тестът „sandbox hardening“ (т. 9.5). S3(и) пада → СПРИ.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://raw.githubusercontent.com/moby/moby/master/daemon/oci_linux.go; https://raw.githubusercontent.com/moby/sys/main/mount/flags_unix.go, 20.10.2026

## D-105 RunSpec.publicEnv (20.10.2026)
Решение: RunSpec.publicEnv: Record<string,string> (т. 6.14). Публичните стойности (PATH=/usr/local/bin:/usr/bin:/bin, HOME=/home/agent, LANG, CI, NPM_CONFIG_REGISTRY, tests.env, …) влизат в argv като `-e NAME=value` (не са тайни). RunSpec.envNames съдържа САМО имена на тайни: SECRET_ENV_NAMES = ["ANTHROPIC_API_KEY","AWS_SECRET_ACCESS_KEY"] (константа в sandbox/hardening.ts); те са `-e NAME`, а стойността им е в spawn env (D-043). buildRunArgs хвърля E_FORBIDDEN_DOCKER_FLAG, ако envNames съдържа име извън SECRET_ENV_NAMES, ако publicEnv съдържа име от SECRET_ENV_NAMES или ако име е и в двете. envForPhase връща {names (тайни), publicValues (останалите)} и worker-ът ги подава като envNames/publicEnv. Така o.env на DockerRunner.run съдържа само стойностите на тайните, а PATH, HOME, DOCKER_* и XDG_RUNTIME_DIR на хоста остават за самия docker CLI (D-084; ~/.docker, rootless context). Snapshot тестът на buildRunArgs се обновява (публичните като "-e","NAME=value"; тайните като "-e","NAME").
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-106 appendLedger(path, input, now?) получава ВЕЧЕ редактиран payload (20.10.2026)
Решение: appendLedger(path, input, now?) получава ВЕЧЕ редактиран payload (D-075): само смята payload_hash = hashJcs(payload) (null при payload null), seq, prev_hash и hash и добавя ред с fsync. Lock НЕ взема: извикващият държи run.lock (worker-ът); unit тестовете от E0.1 го викат без lock. Worker-ът прави: redactJson(payload) → appendLedger( <home>/ledger.jsonl, {…, payload: редактиран}) → writeRedacted(runs/<run_id>/ledger-payloads.jsonl, {seq, payload: редактиран}, r, {append:true}). appendSecurityEvent прави redact на detail сам (има Redactor), пише в <home>/security_events.jsonl и при warn|incident вика appendLedger и пише {seq, payload} в <home>/runs/<ev.run_id>/ledger-payloads.jsonl (run dir се извежда от home и ev.run_id; run_id null → без payload ред).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-107 verifyLedger парсва всеки ред с `LedgerEntryAnyOrg = LedgerEntry.extend({ org_id (20.10.2026)
Решение: verifyLedger парсва всеки ред с `LedgerEntryAnyOrg = LedgerEntry.extend({ org_id: z.string() }).strict()` (иначе чужд org пада още като E_SCHEMA и E_ORG е недостижим). Ред на проверките за всеки ред: E_PARSE (JSON.parse) → E_SCHEMA → E_ORG (org_id ≠ opts.org ?? "o_local") → E_SEQ_GAP (seq ≠ номера на реда) → E_PREV_HASH → E_HASH.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-108 fixtures/shop се създава в E0.2а с 3 файла (20.10.2026)
Решение: fixtures/shop се създава в E0.2а с 3 файла: package.json, package-lock.json (D-036) и vitest.config.ts (крайните им версии). Docker тестът „install през gate“ сийдва директно папката fixtures/shop с packTree (D-114), без mirror. Кодът с бъга, тестовете и останалите файлове от т. 7.1 се добавят в E0.2б.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-109 PLACEHOLDER (20.10.2026)
Решение: PLACEHOLDER (само E0.2б) е "unknown" САМО когато износът е ok, INTEGRITY е pass и CANARY е pass (т.е. проверката би вървяла). Във всички други случаи (INFRA, AGENT, ExportRejection, INTEGRITY unknown, CANARY fail) е "n/a" без signature. Ред в E0.2б: EXPORT, INTEGRITY, CANARY, PLACEHOLDER, после AGENT и INFRA (само ако има). Така тестът „infra след стъпка 7“ остава с reasons ТОЧНО ["infra:install_base","INFRA:INSTALL_BASE:-"].
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-110 Exit кодът на агента (20.10.2026)
Решение: Exit кодът на агента. Worker-ът записва runs/<run_id>/agent-exit.json {"exit": n | null, "timedOut": boolean} (без redaction; exit null, ако агентът не е пускан или е спрян по D-020). RunTaskOutput получава agentExit: number | null. Exit кодът НЕ влиза във Verdict и не променя присъдата (т. 7.6). `mandat bench` вика runTask() в процеса и маркира реда MISMATCH при agentExit === 3 (fake не е намерил низа, т. 9.6), независимо от присъдата.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-111 startGate получава npmRegistryUrl? (20.10.2026)
Решение: startGate получава npmRegistryUrl?: string (по подразбиране "https://registry.npmjs.org"). Друга стойност се подава САМО от unit тестовете in-process (stub за „gate: npm кеш“). main.ts на gate-а НЕ чете env за това и винаги ползва подразбирането (по-малко повърхност за грешна конфигурация).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://registry.npmjs.org", 20.10.2026

## D-112 Tar при износа се чете ДВА пъти от временен файл (20.10.2026)
Решение: Tar при износа се чете ДВА пъти от временен файл. exportChangeset записва потока в <tmpRoot>/export.tar; при 524288000 байта (500 MiB) записът спира, процесът tar в контейнера се убива и резултатът е tar_too_large (path "-"). scanTar върви върху fs.createReadStream(файла); при ok разархивирането е второ четене на същия файл. Файлът се трие във finally. tmpRoot = fs.mkdtemp(path.join(os.tmpdir(), "mandat-<run_id>-")), извън .mandat (R8(а) грепва .mandat/), и се трие във finally на run-а (също при --keep). Временните клонове (7.4(1), 7.7(3), recompute) са в същия tmpRoot.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-113 mixed.json се записва със scripts/record-mixed.mjs (20.10.2026)
Решение: mixed.json се записва със scripts/record-mixed.mjs (комитва се): създава временния проект ТОЧНО в /tmp/mandat-mixed (трие го преди и след), пуска vitest 5.0.5 без CI, после заменя всяко testResults[i].name с "/m/work/<път спрямо /tmp/mandat-mixed>" и записва fixtures/vitest-reports/mixed.json (2 интервала отстъп, LF). Тестът подава workRoot "/m/work".
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-114 Seed tar потокът се прави с node-tar (20.10.2026)
Решение: Seed tar потокът се прави с node-tar (tar 7.5.22, вече зависимост на @mandat/export): функция `packTree(dir: string): NodeJS.ReadableStream` в @mandat/export = `tar.c({ cwd: dir, portable: true, filter: p => нито един компонент не е ".git" и p не е топ-ниво "node_modules" }, ["."])`. portable: true маха uid/gid/uname/gname/atime/ ctime (README v7.5.22: „Note that `mtime` is still included“; mtime на файловете остава, без значение за tree_sha). Не `git archive` (прилага export-ignore/export-subst от .gitattributes) и не системния tar (bsdtar на macOS).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-115 Списъкът на файловете на fixtures/shop (20.10.2026)
Решение: Списъкът на файловете на fixtures/shop (т. 7.1) е ТОЧНО 10: package.json, package-lock.json, src/money.ts, src/cart.ts, tests/money.spec.ts, tests/cart.spec.ts, vitest.config.ts, tsconfig.json, .gitignore, README.md. `fixtures build` копира само тях (D-050).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-116 Състояние на проксито в <home>/proxy/usage.jsonl (20.10.2026)
Решение: Състояние на проксито в <home>/proxy/usage.jsonl (JSON Lines, пише го проксито с fsync): {"kind":"request","ts","run_id","method","path","status","model","input_tokens","output_tokens","cache_read", "cache_write","usd","token_prefix8"} по един на заявка (вкл. отказаните: model null при липса, usd 0) и {"kind":"revoke","ts","run_id"} при /admin/revoke. При старт проксито прочита файла (невалидни редове се пропускат с 1 предупреждение на stdout) и възстановява spent (сума на usd по run_id), requests и revoked. Така --restart unless-stopped не нулира бюджета и отнемането. POST /v1/messages/count_tokens: usd 0, брои се в requests. Не-SSE отговор: usage от полето usage на JSON тялото (липсва → 0). Stdout логва същите полета (т. 8.1). Unit тест „рестарт пази spent и revoked“.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-117 Stub upstream (20.10.2026)
Решение: Stub upstream: файлът е packages/llm-proxy/stub/stub-upstream.mjs (ESM, само node:http, 0 зависимости), копира се с COPY в /opt/mandat/stub-upstream.mjs в образа на проксито и влиза в h12 на проксито (D-053). Слуша на :9000. POST /v1/messages → 200, content-type text/event-stream, точно три събития: `event: message_start` / data {"type":"message_start","message":{"id":"msg_stub","type":"message","role":"assistant", "model":"claude-sonnet-5-5","content":[],"stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}; `event: message_delta` / data {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":5}}; `event: message_stop` / data {"type":"message_stop"}. Всичко друго → 404. Тестовото прокси: MANDAT_PROXY_UPSTREAM_URL=http://mandat-test-stub-<id>:9000. Финален етап на образите на gate и proxy: `COPY --from=build /out /opt/mandat/<pkg>`; `CMD ["node","/opt/mandat/<pkg>/dist/main.js"]` (<pkg> = egress-gate | llm-proxy).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: http://mandat-test-stub-<id>:9000, 20.10.2026

## D-118 Bind mount-ове за role "gate" (20.10.2026)
Решение: Bind mount-ове за role "gate" (точно тези; всичко друго → E_FORBIDDEN_DOCKER_FLAG): ro ДИРЕКТОРИЯ ${runDir}/gate/policy или ${runDir}/gate/<x>/policy; rw ДИРЕКТОРИЯ ${runDir}/gate/log или ${runDir}/gate/<x>/log; rw ДИРЕКТОРИЯ ${mandatHome}/cache/npm (x ∈ {base, a, b}, D-081). Тестът „buildRunArgs: $HOME“ ги покрива.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-119 Docker Desktop (20.10.2026)
Решение: Docker Desktop: проксито също върви с `--user $(id -u):$(id -g)` (както gate-ът, D-080), не като 1000, защото proxy/secret е 0600 на потребителя на хоста (на macOS uid 501). S3(з) добавя проба „проксито чете proxy/secret и пише proxy/usage.jsonl като потребителя на хоста“. Несъответствие → СПРИ (т. 13).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-120 D1, D3, D4 при няколко попадения (20.10.2026)
Решение: D1, D3, D4 при няколко попадения. D1: data.regressions = всички ID по реда на baseline.tests; signature = първото. D3: обхождат се files в реда на --name-status; за всеки файл (path, после old_path): protected_path (първият glob по реда в protected_paths, който съвпада) → protected_json_invalid → protected_field (полетата по реда на масива в protected_json_fields). data.findings = всички [{"cls","id"}]; signature = първото. D4: data.paths = всички нормализирани пътища (уникални, по реда на files, path преди old_path); signature = първият.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-121 package.json в дървета A и B (20.10.2026)
Решение: package.json в дървета A и B: ако package.json е невалиден JSON в head ИЛИ в base, или липсва в head, а го има в base → целият файл се взема от base. Иначе obj = JSON.parse(head); за всяко поле от protected_json_fields: ако base го има (Object.hasOwn) → стойността от base, иначе полето се трие; записва се `JSON.stringify(obj, null, 2) + "\n"`. Липсва и в двете → нищо. Липсва само в base → base = {} (защитените полета се трият).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-122 `export const UnsealedContract = Contract.omit({ config_hash (20.10.2026)
Решение: `export const UnsealedContract = Contract.omit({ config_hash: true, contract_hash: true }).extend({ config_hash: Sha256.optional(), contract_hash: Sha256.optional() }).strict();` в schemas.ts. sealContract(c: UnsealedContract): Contract. `mandat contract seal` парсва файла с UnsealedContract (грешка → exit 5), запечатва и записва.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-123 fixtures/contracts/sample.json (20.10.2026)
Решение: fixtures/contracts/sample.json (E0.1) = полетата на contracts/fix-discount.json от т. 7.2, но base_commit = 40 нули и hidden_tests null, запечатан със sealContract. Вариантите в тестовете (hidden_tests, risk_cap 2, allowed_paths ["src/**","lib/**"]) се правят в кода на теста + sealContract.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-124 renderAgentContract при празен must_pass дава реда "- none" (20.10.2026)
Решение: renderAgentContract при празен must_pass дава реда "- none". ParsedReport.total = tests.size (броят ID след парсване), не numTotalTests.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-125 Корпусът за redaction (20.10.2026)
Решение: Корпусът за redaction: „≥ 32 знака след префикса“ важи за всички видове освен aws; AWS ключовете са ТОЧНО "AKIA" + 16 знака [0-9A-Z] (иначе \bAKIA[0-9A-Z]{16}\b не съвпада).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-126 recomputeTreeSha → {error:"apply_failed"} в EXPORT 5 (20.10.2026)
Решение: recomputeTreeSha → {error:"apply_failed"} в EXPORT 5: INTEGRITY "unknown", signature "INTEGRITY:apply_failed:-", Verdict.integrity "mismatch", SecurityEvent tree_mismatch (incident, source "worker", detail {"reason":"apply_failed"}) + ред в дневника; VERIFY се пропуска. В проверката след VERIFY (R6): signature "INTEGRITY:apply_failed:post_verify", иначе същото като D-074.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-127 tar-scan и типовете на node-tar (20.10.2026)
Решение: tar-scan и типовете на node-tar (tar 7.5.22: read-entry.ts, parse.ts, header.ts, https://raw.githubusercontent.com/isaacs/node-tar/v7.5.22/src/read-entry.ts, 20.10.2026). Пътищата се декодират с Buffer.toString("utf8"), затова невалидните байтове стават U+FFFD → non_utf8_path = пътят съдържа "�". Събитие 'entry': File, OldFile, ContiguousFile → File; Directory → Directory; SymbolicLink, Link, CharacterDevice, BlockDevice, FIFO → както в т. 7.7(2); всеки друг тип (напр. GNUDumpDir) → device. Мета заглавките (ExtendedHeader, GlobalExtendedHeader, NextFileHasLongPath, NextFileHasLongLinkpath, OldGnuLongPath, OldExtendedHeader) се поглъщат от Parser-а и не идват като 'entry'. Събитие 'ignoredEntry' (непознат тип или прекалено голяма мета заглавка) → device с пътя на записа. Водещото "./" се маха преди проверките.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://raw.githubusercontent.com/isaacs/node-tar/v7.5.22/src/read-entry.ts, 20.10.2026

## D-128 verify-log (20.10.2026)
Решение: verify-log: крайният празен елемент след последния LF се игнорира (празен ред по средата → E_PARSE). Празен файл → {ok:true,count:0,lastHash:null}, текст "OK: empty ledger", exit 0. Липсващ файл → stderr "ledger not found: <path>", exit 3. E_PARSE: "TAMPERED: seq <n> (line <n>) E_PARSE — invalid JSON". Изходни кодове на verify-log, bench, redteam (допълва D-026): 0 ок, 1 несъответствие, 2 грешна употреба, 3 среда/infra (липсващ файл, образи, Docker).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-129 Evidence.source по детектор (20.10.2026)
Решение: Evidence.source по детектор: EXPORT, CANARY → "export"; INTEGRITY, D10.lockfile, D3.protected, D4.contract, MUST_PASS, AGENT, INFRA, PLACEHOLDER → "worker"; D1.base_tests, D2.inventory → "sandbox:verify". diff_hash = sha256Tag(суровите байтове на diff.patch), смятан в паметта (и когато diff.patch не се записва, D-071).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-130 Изход на fake агентите (20.10.2026)
Решение: Изход на fake агентите (stdout, по един JSON ред): в началото {"type":"system","subtype":"init","session_id":"fake", "model":"fake","tools":[],"mcp_servers":[]}; при успех накрая {"type":"result","subtype":"success","is_error":false, "total_cost_usd":0,"num_turns":1} и exit 0. Ако точният низ липсва: stderr "fake: pattern not found: <низ>", без result, exit 3. fakeAdapter.parseLine = същият парсер като на claude (claude/stream.ts).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-131 CI job docker-it (20.10.2026)
Решение: CI job docker-it (needs check): actions/checkout@v7.0.1 → pnpm/action-setup@v6.1.0 (без version) → actions/setup-node@v7.1.0 (24.22.0, cache: pnpm) → pnpm install --frozen-lockfile → pnpm build → pnpm mandat images build → pnpm mandat fixtures build → pnpm test:docker → pnpm mandat bench → pnpm mandat redteam.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-132 Docker тестовете по projects (20.10.2026)
Решение: Docker тестовете по projects (D-067; файлът е в папката на пакета на project-а и пуска `node packages/cli/dist/main.js` при нужда): sandbox = „sandbox hardening“, „resolv/hosts mounts“, „doctor --deep“, „S3(ж) порт“, S3(и); egress-gate = „gate DNS“, „gate DNS AAAA“, „gate→прокси→stub“, „install през gate“, „build context без тайни“; worker = „walking skeleton fake“, „fixtures build детерминистичен“, „base пада точно с 1 тест“, „ръчната фикстура = истинския отчет“ и E0.3а тестовете; bench = bench и redteam (E0.3б).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-133 Датата на `fixtures build` е във вътрешния формат на git (20.10.2026)
Решение: Датата на `fixtures build` е във вътрешния формат на git: GIT_AUTHOR_DATE=GIT_COMMITTER_DATE="@1792454400 +0000" (= 2026-10-20T00:00:00Z). Git docs: „Git internal format: `<unix-timestamp> <time-zone-offset>` … It is safer to prepend the `<unix-timestamp>` with `@`“ (https://raw.githubusercontent.com/git/git/master/Documentation/date-formats.adoc, 20.10.2026). Детерминизмът се проверява от docker теста „fixtures build детерминистичен“.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://raw.githubusercontent.com/git/git/master/Documentation/date-formats.adoc, 20.10.2026

## D-134 bench броячи (20.10.2026)
Решение: bench броячи: false_verified = редовете с actual "VERIFIED" и expected ≠ "VERIFIED"; false_failed = редовете с actual "FAILED" и expected ≠ "FAILED". pass = редовете без MISMATCH (присъдата е очакваната, reasons_ok и agentExit ≠ 3, D-110).
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-135 macOS: ако `git --version` е под 2.43.0 (20.10.2026)
Решение: macOS: ако `git --version` е под 2.43.0 (системният Apple Git), doctor и preflight дават E_GIT_VERSION с подсказка „brew install git; провери с `which git`, че /opt/homebrew/bin/git (или /usr/local/bin/git) е преди /usr/bin/git в PATH“. README казва същото в т. 2.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-136 writeRedacted с maxBytes (20.10.2026)
Решение: writeRedacted с maxBytes: броят се записаните (редактирани) байтове във файла; записът, който би минал лимита, се пропуска изцяло, веднъж се добавя ред "[truncated at <maxBytes> bytes]\n" и всички следващи записи в този файл се пропускат. Не хвърля грешка; връща hits и за пропуснатото. agent-stderr.txt и transcript.jsonl са с maxBytes 1048576 и 52428800.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-137 Gate без заредена валидна политика (20.10.2026)
Решение: Gate без заредена валидна политика (напр. невалиден първоначален policy.json): всички HTTP заявки → 403, DNS → SERVFAIL, ред в events.jsonl не се пише (няма run_id). Оркестраторът вижда това като липса на policy_loaded → E_GATE_POLICY.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: решение на промпта (20.10.2026)

## D-138 ≥ 2 CPU за Docker (20.10.2026)
Решение: ≥ 2 CPU за Docker: --cpus=2 се отказва, ако демонът има по-малко CPU (moby daemon/daemon_unix.go: „range of CPUs is from 0.01 to %[1]d.00, as there are only %[1]d CPUs available“, https://raw.githubusercontent.com/moby/moby/master/daemon/daemon_unix.go, 20.10.2026). doctor проверява `docker info --format '{{.NCPU}}'` ≥ 2 (поле NCPU в system.Info, https://raw.githubusercontent.com/moby/moby/master/api/types/system/info.go, 20.10.2026), иначе E_DOCKER с „Docker вижда N CPU; нужни са ≥ 2 (Docker Desktop: Settings → Resources)“, exit 3. Ред в т. 2.
Защо: виж „Решение“ (обосновката е в текста на решението)
Алтернативи: описаните в текста на решението (ако има); иначе — няма разгледани.
Източник: https://raw.githubusercontent.com/moby/moby/master/daemon/daemon_unix.go; https://raw.githubusercontent.com/moby/moby/master/api/types/system/info.go, 20.10.2026
---

# Нови решения на кодера (D-139+)

## D-139 Край на токените в redaction: lookahead вместо \b (20.10.2026)
Решение: Правилото mandat_token завършва с `(?![A-Za-z0-9_-])` вместо `\b`.
Защо: base64url HMAC може да завърши на "-" или "_"; тогава `\b` пред кавичка не съвпада и токенът минава само като entropy (или изобщо не, ако сегментът е кратък).
Алтернативи: `\b` по т. 8.4 (пропуска ~1/32 от токените като mandat_token).
Източник: решение на кодера; тест „mdt_ токен, завършващ с '-'“.

## D-140 Redaction allowlist: вградени ID-та и NAME=value (20.10.2026)
Решение: Преди entropy проверката на сегмент: (1) ако след махане на вградени `r_|se_<ULID>` остава само [a-z0-9._-] → сегментът не се редактира (имена като `mandat-net-r_<ULID>-agent`); (2) сегмент `NAME=value` (NAME = [A-Z][A-Z0-9_]*) се съди само по value.
Защо: по буквата на т. 8.4 тези два реалистични низа (имена на Docker обекти и env редове като `ANTHROPIC_DEFAULT_HAIKU_MODEL=claude-haiku-5-5`) са с entropy ≥ 4,5 и биха се редактирали — шум в логовете и грешни лъжливо положителни в корпуса. Тайна стойност след `=` пак се хваща (тест).
Алтернативи: да махна тези низове от корпуса и да ги редактираме (по-лоши логове).
Източник: решение на кодера; ЗА ПРЕГЛЕД ОТ СИМО (намалява redaction в тесен случай).

## D-141 Клон и push в облачната сесия (20.10.2026)
Решение: Работата е на клон `claude/new-session-42gq0n` (не `phase/e0-walking-skeleton`, т. 14.1) и се push-ва към `origin` на GitHub.
Защо: сесията върви в облачен контейнер, който се изтрива; средата изисква точно този клон и push, иначе работата се губи. Правилото „без push“ на продукта (И2: агентът в пясъчника никога не пушва) не се засяга.
Алтернативи: локален клон без push (работата изчезва с контейнера).
Източник: инструкциите на облачната сесия; ЗА ПОТВЪРЖДЕНИЕ ОТ СИМО.

## D-142 Тестове срещу изходния код; typecheck с отделен tsconfig (20.10.2026)
Решение: vitest.config.ts има alias `@mandat/<pkg>` → `packages/<pkg>/src/index.ts`; `pnpm typecheck` = `tsc -p tsconfig.check.json` (paths към src, включва тестовете и scripts/*.test.ts с allowJs); build-ът на пакетите (`tsc -b`) изключва *.test.ts.
Защо: unit тестовете не зависят от остарял dist/; покритието се мери върху src; типовете на тестовете също се проверяват.
Алтернативи: тестове срещу dist (изисква build преди всеки тест).
Източник: решение на кодера.

## D-143 `mandat contract seal|show-agent` още в E0.1 (20.10.2026)
Решение: Двете подкоманди от т. 6.13 са направени в E0.1 (с тестове), освен `verify-log`.
Защо: fixtures/contracts/sample.json се запечатва със sealContract (D-123); командата е тънка обвивка над вече тестваните функции.
Алтернативи: да чакат E0.2б.
Източник: решение на кодера.

## D-144 verify-log: липсващ дневник и --json (20.10.2026)
Решение: Липсващ файл → stderr "ledger not found: <път>", exit 3, stdout празен (и при --json). `--org` приема само o_local (друго → exit 2). Хешовете в текста са `sha256:<първите 12 hex>…`; --json съдържа пълните.
Защо: т. 6.13 не дава JSON форма за тази грешка, а ErrorCode няма подходящ код; не измислям нов код извън packages/contract.
Алтернативи: {"error":{…}} с нов ErrorCode (изисква промяна на 6.14).
Източник: решение на кодера.

## D-145 gitleaks в облачната среда (20.10.2026)
Решение: `pnpm gitleaks` остава `docker run ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f` (digest на OCI индекса от `docker buildx imagetools inspect`, 20.10.2026). В тази облачна сесия pull-ът пада (403 от прокси към pkg-containers.githubusercontent.com), затова проверката е пусната със същата версия като release binary (gitleaks_8.30.1_linux_x64.tar.gz, sha256 551f6fc8…70eb, сверен с checksums.txt) със същите аргументи: `gitleaks git . --config=.gitleaks.toml --redact --no-banner`.
Защо: среда без достъп до blob хоста на ghcr; на машината на Симо и в CI docker пътят работи.
Алтернативи: да се пропусне проверката (не).
Източник: https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1, 20.10.2026.

## D-146 Записани проверки от E0.1 (20.10.2026)
Решение: (а) D-058: digest на node:24.22.0-bookworm-slim = sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 (OCI индекс; hub.docker.com/v2/repositories/library/node/tags/24.22.0-bookworm-slim, 20.10.2026; `imagetools inspect` върна 429 от Docker Hub) — съвпада с т. 4.3. (б) D-085: `pnpm --silent mandat … --json` дава точно 1 ред на stdout (тестът минава) → README ползва `pnpm --silent`. (в) D-052: форматът на `pnpm licenses list --json` в pnpm 12.14.0 е `{ "<license>": [{ name, versions[], paths[], license, author, homepage, description }] }`; записан във fixtures/licenses/ (абсолютните пътища са заменени с `<repo>`). (г) turbo 2.11.9 чете pnpm 12 lockfile без проблем.
Защо: [НП] от промпта, затворени с проба.
Алтернативи: —
Източник: пробите в тази сесия (20.10.2026).

## D-147 v8 ignore за код без exit (20.10.2026)
Решение: Единственият `/* v8 ignore next */` е в cleanGit за процес, убит със сигнал (exit code null → 1).
Защо: клонът не може да се упражни детерминистично в unit тест; без него packages/export пада под 85% branches при 1 функция.
Алтернативи: изкуствен тест, който убива git.
Източник: решение на кодера.

## D-148 Разлики между облачната машина и машината на Симо (20.10.2026)
Решение: Облачният контейнер: Docker Engine 29.9.1 rootful, **cgroup v1**, 4 CPU, git 2.43.0, Node 22 по подразбиране (Node 24.22.0 и pnpm 12.14.0 са инсталирани от nodejs.org/npm със сверен SHA256). Нищо от E0.1 не зависи от Docker освен gitleaks.
Защо: E0.2а (S3(г), --memory/--pids-limit, hardening тестът „pids.max = 512“) може да се държи различно при cgroup v1; спайкът S3 трябва да се пусне на машината на Симо (rootless, cgroup v2), не само тук.
Алтернативи: —
Източник: `docker info`, 20.10.2026.

---

# Седмичен преглед на часовете

| Седмица | Подфаза | План (ч) | Реално (ч) | Бележка |
| --- | --- | --- | --- | --- |
| 20.10.2026 | E0.1 | 9–11 | ≈ 0,5 (една агентска сесия, wall-clock; без прегледа на Симо) | вж. docs/reports/E0.1.md |

## D-149 Корпусът за redaction е на фрагменти (20.10.2026)
Решение: fixtures/redaction/corpus.json пази всеки фалшив ключ като `parts` (префикс | тяло; JWT по сегменти);
тестовете ги съединяват по време на изпълнение. Тест проверява, че нито един фрагмент сам не съвпада с правилото си.
Защо: GitHub push protection (GH013) отказа push-а заради ключоподобни литерали (AWS, Slack) в корпуса, въпреки че са
фалшиви. D-095 позволява сглобяване по време на изпълнение. Сега и gitleaks без allowlist намира 0 в fixtures/.
Алтернативи: „allow secret“ в GitHub за всеки ключ (ръчно, на Симо); allowlist само в gitleaks (не помага за GitHub).
Източник: отговорът на GitHub при push, 20.10.2026.

## D-150 Допълнителен CA за TLS-прихващащи мрежи (20.10.2026)
Решение: Ако на хоста е зададена `MANDAT_EXTRA_CA_CERTS=<път до PEM>`: `images build` го подава като BuildKit secret (`--secret id=extra_ca`, никога в слой на образа), а gate и proxy контейнерите го получават ro на `/etc/mandat-ca.pem` с `NODE_EXTRA_CA_CERTS`. Пясъчникът никога не го получава (той говори само чист HTTP към gate-а). buildRunArgs позволява този ro файл САМО за role "gate" (RunSpec.caFile); buildProxyRunArgs — чрез ProxyRunOptions.caFile. Без променливата няма никаква промяна.
Защо: облачната среда на сесията прихваща изходящия TLS със собствен CA; без него npm/pnpm/gate не стигат до registry.npmjs.org.
Алтернативи: `--network host` при build (по-широко), CA в образа (изтича в слой).
Източник: /root/.ccr/README.md на средата, 20.10.2026.

## D-151 SANDBOX_APT=0 и Node версии на R14 пробите (20.10.2026)
Решение: Dockerfile-ът на пясъчника има `ARG SANDBOX_APT=1`; `MANDAT_SANDBOX_APT=0` при `images build` пропуска apt (curl, bind9-dnsutils, ca-certificates). r14-netprobe ползва точните curl/dig команди от т. 8.7, ако ги има; иначе всяка проба има Node еквивалент със същата семантика на exit/http_code/dns_status, а `cmd` става "node:<командата>". Тагът на образа не отразява build arg-а (образът е само локален).
Защо: в облачната среда deb.debian.org е блокиран от мрежовата политика (CONNECT 403; DNS не резолвира). На машината на Симо подразбирането е спецификацията.
Алтернативи: статични curl/dig от GitHub (непроверен произход).
Източник: пробата в тази сесия, 20.10.2026.

## D-152 --sysctl disable_ipv6 само ако ядрото има IPv6 (20.10.2026)
Решение: RunSpec.ipv6Sysctl (по подразбиране true). Worker-ът и doctor пускат веднъж `docker run --rm --network none <sandbox> test -e /proc/sys/net/ipv6/conf/all/disable_ipv6` (probeIpv6, кеш на процес); при липса sysctl-ът се маха от SANDBOX_HARDENING за този run.
Защо: на ядро без IPv6 runc отказва контейнера („open sysctl net.ipv6.conf.all.disable_ipv6 … no such file“). Без IPv6 в ядрото няма какво да се изключи; p4 (IPv6) остава блокирана (проверено: 8/8).
Алтернативи: да се изисква IPv6 на хоста.
Източник: грешката на runc в тази сесия, 20.10.2026.

## D-153 Резултат от S3 (20.10.2026)
Решение: DNS_MODE = "gate" (resolv.conf, монтиран ro, сочи gate-а; dns_block се логва). Gate без --cap-add (ip_unprivileged_port_start = 0). Пясъчникът с --log-driver=none печата stdout при attach. Нов volume наследява собствеността на /m. tmpfs с exec работи. Подробности: docs/spikes/S3.md.
Защо: пробите минаха.
Алтернативи: резервът от D-037 не е нужен.
Източник: docs/spikes/S3.md.

## D-154 E0.2б и E0.3а в една поредица; PLACEHOLDER не се ползва (20.10.2026)
Решение: Симо поиска работа без спирки между подфазите. Worker-ът минава направо към истинската проверка (VERIFY A/Б, D1–D4, D10, MUST_PASS); детекторът PLACEHOLDER остава в схемата (DetectorId), но не се произвежда. Тестовете от E0.2б, които очакват PLACEHOLDER (walking skeleton → UNKNOWN), са написани в крайната им E0.3а форма (honest-fix → VERIFIED).
Защо: PLACEHOLDER е временна стъпка; след E0.3а тестът му така или иначе се сменя.
Алтернативи: два прохода по worker-а.
Източник: инструкцията на Симо „продължавай без да спираш“, 20.10.2026.

## D-155 npmAllowlistFromLockfile е в @mandat/contract (20.10.2026)
Решение: Функцията (чиста, само данни) е преместена от egress-gate в contract/src/npm-allowlist.ts; egress-gate я реекспортира (сигнатурата от 6.9 е същата).
Защо: D10.lockfile в core трябва същото правило, а core не бива да импортира egress-gate (т. 5, правило 6). Един източник вместо копие.
Алтернативи: дублиране в core.
Източник: решение на кодера.

## D-156 Подробности по runTask (20.10.2026)
Решение: (а) RunTaskInput има незадължителен `internals` (env, progress, fake gate/tests/recompute, images, healthz, channel…) — шевове за unit тестовете с fake docker (D-091); `mandat run` не ги излага (D-040). (б) Записите в transcript.jsonl и agent-stderr.txt са последователна опашка (иначе редовете могат да разменят реда си — открито от теста „transcript формат“). (в) Дърветата A/B се строят от файловете на base и H (без .git и топ-ниво node_modules). (г) verify/report-a/b.json са сурови; ако съдържат canary/токен → {"redacted":true} (D-031). (д) При timeout на агента собственият таймер прави `docker stop -t 30 mandat-agent-<run>`; таймаутът на docker CLI е с 2 min резерв.
Защо: детерминистични тестове и ред на транскрипта.
Алтернативи: —
Източник: решение на кодера.

## D-157 Червеният отбор: R6 и R8(б) (20.10.2026)
Решение: R6 добавя към export/diff.patch валиден diff за НОВ файл src/extra.ts (вместо втори hunk към src/cart.ts) — пак валиден patch, пак друго дърво → INTEGRITY:mismatch:post_verify. R8(б) парсва notes.txt от диска (минал през redaction; полетата hits и anthropic_api_key_prefix="mdt_" не се редактират), защото RunHooks (D-040) няма hook за суровите notes.
Защо: по-прост и стабилен patch; без нов hook в публичния интерфейс.
Алтернативи: RunHooks.onNotes.
Източник: решение на кодера.

## D-158 bench MISMATCH и при infra причина (20.10.2026)
Решение: Ред е MISMATCH и когато reasons съдържат "infra:" (освен по D-110 при agentExit 3); bench спира с exit 3, ако run върне грешка без присъда (preflight).
Защо: infra не бива да минава като „очаквана“ присъда UNKNOWN.
Алтернативи: —
Източник: решение на кодера.

## D-159 Спайкове S0–S2 не са пуснати (20.10.2026)
Решение: spikes/harness.mjs, s0-run.mjs, s1-run.mjs (+ s1-mcp-server.mjs, docker/spike-mcp/Dockerfile), s2-run.mjs са написани и проверени до границата без ключ (импорт, guard „прокси не върви“, MCP сървърът отговаря на tools/list, образът се билдва). Пускането иска `ANTHROPIC_API_KEY=… pnpm mandat proxy start` от Симо. Тестът „stream парсер: фикстура“ се активира, когато S0 запише fixtures/stream-json/claude-2.1.302-s0.jsonl.
Защо: в облачната сесия ключ няма (И1: кодерът не пуска proxy start с ключ, т. 14.4).
Алтернативи: —
Източник: т. 13, 14.4.

# Решения на демо промпта (D-200…D-239), преписани при старта на E1а (20.10.2026)

Източник: docs/spec/НОИТ_Мандат_v4_демо_промпт_кодер.md т. 12 (дословно). Статусите: „решено“, „Симо: по подразбиране X“ (Q в docs/questions-for-simo.md), „техническо, отворено“. D-240…D-259 са резерв; решенията на кодера са от D-260.

## D-200
Режим без спирки (т. 0.3, 0.8) заменя E0 т. 0 (4), т. 13 и края на т. 14.6. Източник: съобщението на Симо, с което е пуснат този промпт (20.10.2026); в решения.md (В-1…В-6) няма отделен запис. Симо: по подразбиране без спирки.

## D-201
Приоритет на източниците и таблицата на разминаванията (т. 2). `.mandat.yml` runtime.node приема "24". Решено.

## D-202
Версии на НОВИ [НП] зависимости: най-новата версия, публикувана ≥ 14 дни преди деня на добавяне (по полето time в registry), точна версия; минимумът на E0 (minimumReleaseAge 4320 = 3 дни) остава като предпазител. Таблицата в т. 2.4 и закрепените версии на E0 не се пипат (F10). zod остава една версия в монорепото: 4.6.7 на E0 (pnpm overrides), защото @modelcontextprotocol/server иска ^4.2.0 и две копия на zod чупят схемите между пакетите; последната ≥ 14 дни е 4.6.5. Техническо, отворено (кодерът проверява дали 4.6.5 чупи E0 тестовете; без смяна по подразбиране).

## D-203
MCP: @modelcontextprotocol/server 2.3.1 (v2, Apache-2.0) в продукта; @modelcontextprotocol/client 2.3.1 (Apache-2.0, проверен в registry) само като devDependency за mcp-sdk-client.test.ts; @modelcontextprotocol/sdk 1.32.1 остава само в spikes (E0 D-086). Основните тестове говорят JSON-RPC ръчно (двете ери). Решено.

## D-204
Пакетите export, sandbox, redaction стават Apache-2.0 заедно с ядрото (спец. оставя избора: Apache или отделен процес). Причина: verify ги линква; Симо е единствен автор. Симо: по подразбиране Apache.

## D-205
Нов пакет packages/verify (Apache-2.0): verifyChange + runTestProcedure и останалото от т. 4.1 (преместено от apps/worker); bin `mandat-verify`; `mandat verify` в cli е псевдоним (процес). Решено.

## D-206
Външна присъда: EXPORT, INTEGRITY, D10.lockfile, D1, D2 (вкл. weakened), D3, D4 (ако има тип), D7.ci (при PR); MUST_PASS и CANARY n/a; may_change_tests = false без тип; липсващ детектор, изискан от политиката → FAILED INFRA:detector_missing (спец. T3-3, F21); липсваща политика на base → UNKNOWN POLICY:missing. Принцип: D5 (когато съществува) се пуска и за външни присъди. Симо: по подразбиране тази семантика (продуктово решение).

## D-207
Ключ на стълбата за външни: agent = external:gh:<user_id> (S38); MCP: external:mcp-local без стълба (S39); таван 1; никога сливане/ready от Мандат за външен PR. config_hash = hashJcs(policy) вместо „каноничен YAML“ (спец. т. 5). Симо: по подразбиране без праг за вдигане на тавана (В-3 го оставя отворен).

## D-208
CUSUM: стъпките са точните ln(0,95/0,85) и ln(0,05/0,15) (закръглените в спец. дават 46, не 45 успеха); смяна на ниво нулира s_up и s_down; hard_fail сваля и pinned (и го маха). Симо: по подразбиране hard_fail маха pinned (последното е продуктово).

## D-209
Conclusion: VERIFIED success, FAILED failure, UNKNOWN action_required със заглавие „UNKNOWN: …“; neutral не се ползва (освен skipped за „Мандат verdict“ на PR на харнеса). Факт: required check минава при successful, skipped или neutral [Ф, github/docs about-protected-branches.md:95, 20.10.2026]. Live L3 проверява, че action_required блокира; ако не → UNKNOWN става failure със същото заглавие. Решено (следва от факта).

## D-210
Outbox таблица (нова, не е в спец. т. 11) и правилата на т. 3.4. Решено.

## D-211
Горен таймаут на състоянията (tasks.state_deadline_at, MANDAT_STATE_MAX_MIN_<STATE>; стойности т. 3.4). Техническо, отворено (стойностите се мерят на демото).

## D-212
Имена на MCP инструментите: mandat_verify, mandat_status, mandat_explain (спец.: verify/status/explain). Причина: клиенти, които показват голите имена, няма да ги смесят с чужди. Симо: по подразбиране с префикс.

## D-213
tree_sha за MCP/CLI: ls-files (минус --deleted) + tar + износът на E0 върху огледало в MANDAT_HOME; нищо не се пише в .git на потребителя. Решено. Публично копие на котвите (спец. т. 10 го иска) — не в този промпт (иска push). Симо: по подразбиране без публично копие до след демото.

## D-214
MCP allowlist чрез --allow / --allow-project-dir; празен или относителен → отказ при старт; realpath, без symlink бягство. Решено.

## D-215
Webhooks: node:http в apps/worker, без hono; без публичен URL → polling на MANDAT_SYNC_POLL_SECONDS (30 s); без тунел. Решено.

## D-216
DB клиент на worker-а: pg (версия по D-202); apps/web: supabase-js. Техническо, отворено (версията).

## D-217
OUTCOME прозорец 0 мин само в org с is_demo = true, с видим надпис „демо“. Симо: по подразбиране 0 мин в демо org.

## D-218
Преливане към агент без история: ниво 0 → branch_only + бутон „Отвори чернова на PR“ на картата (спец. Ф3 пише „ниво 0 → чернова на PR“, а вратата на ниво 0 няма PR; човешкото действие пази правилото). Симо: по подразбиране бутонът.

## D-219
UI без Tailwind/shadcn: CSS variables токени по Ф4 (по-малко зависимости и версии за проверка). Решено.

## D-220
Втора стъпка: нов TOTP код при самото одобрение през Supabase Auth MFA (mfa.challenge + verify → approvals.mfa_verified_at; тригер approvals_method_check; спец. т. 8, т. 11, S08); passkey след НОИТ демото. Ф5 демото „Одобри + passkey“ става „Одобри + TOTP“. Симо: по подразбиране TOTP.

## D-221
Резерва за iOS без инсталирано PWA: inbox + брояч в <title>; имейл известия не са в този промпт. Симо: по подразбиране без имейл.

## D-222
Codex в пясъчника: собствен provider „mandat“ (без websockets) към /v1/responses през gate → прокси; OPENAI_API_KEY = per-task токен; @openai/codex 0.160.1; argv по т. 8.3; точните -c ключове и sandbox режимът са [НП] → S-CX. Техническо, отворено.

## D-223
`mandat bench --fail-gate` (T3-3) по т. 3.4. Решено.

## D-224
Без envelope encryption и без таблица api_keys: ключовете са само в env на проксито, както в E0. Това ОТЛАГА обещание на E0: D-055 („ключът се вижда в docker inspect — приета граница за E0, поправка в E1“; F19), а Ф3 минимумът го съдържа (M9). Симо: по подразбиране отлагане след демото.

## D-225
fixtures/demo-shop е отделен от fixtures/shop (E0 тестовете зависят от точно 10-те файла). Решено.

## D-226
Разширенията на типовете от т. 3.2 (вкл. Codex/преливане, F5). Решено.

## D-227
Формат на рамката T3-5: `<untrusted author="<login>" association="<assoc>" source="<src>">…</untrusted>`; в текста `<`, `>` и `&` се екранират; таг `</untrusted>` вътре не може да затвори рамката (тест). Решено.

## D-228
Live тестовете са в отделен vitest проект `live`; без env → SKIPPED с името на env; SKIPPED не е минал; тестовете с GitHub/VAPID private key ги пуска Симо (т. 0.5). Решено.

## D-229
Бюджет на API за този промпт: ≤ $2 на live пускане, ≤ $10 общо (E0: $5). Симо: по подразбиране $10 (парите са на Симо).

## D-230
Check run имена: „Мандат verdict“, „Мандат approval“, „Мандат harness“ (точно като в спец., с кирилица); external_id: task_id (наши задачи) / ext:<repo>#<n>@<head12> (външни PR). Решено.

## D-231
Ниво ≥ 2: Writer отваря PR (не чернова) и слага „Мандат approval“ сам преди сливането; VERIFY_2 = D7.ci lite за head_sha; без D7 pass → ниво ≤ 1 (d7_missing). fakeGitHub налага ruleset-а (F3, F8, S6). Решено.

## D-232
Доверен base за MCP/CLI/външна присъда: собствен fetch на default клона от `--remote` в огледалото на Мандат; refs от работното дърво на агента не се ползват; HEAD на default клона или незакрепен base → UNKNOWN POLICY:base_untrusted; празна промяна → UNKNOWN EXPORT:empty_change; К-1 от същия base (S1). Решено.

## D-233
D2:weakened (A failed → B passed за същото ID; детерминистичен) и D2:weakened_assertions [О] (по-малко expect/assert по AST; евристика с тестове за фалшиви положителни); fail при --external и без may_change_tests; passed → passed с по-слаб assertion не се хваща (известна граница) (S2). Решено.

## D-234
Изолация на MCP/CLI проверката: mandat-verifyd под отделен потребител `mandat`, сокет, $MANDAT_HOME извън пътищата на агента; без отделен потребител VERIFIED → UNKNOWN INFRA:same_uid; резултатът е съвет (S3, S17, S35). Решено. Симо: създава потребителя по docs/setup/verifyd.md.

## D-235
CAS при push: нов ref `mandat/<task_id>-a<attempt>` за всеки опит през POST /git/refs (422 = вече има → BLOCKED branch_changed_by_human); REST няма CAS по стара стойност (F11; бележка към спец. т. 4). Решено.

## D-236
Одобрение: Route Handler (server-only, service role, след проверка на ролята и нов TOTP при requires_second_factor) вика private.approve_changeset — approvals + ledger + outbox в една транзакция; без `aal2` (спец. S08) (F9, S9). Решено.

## D-237
Външни PR: произход по автор = Writer App + запис в БД (не по име на клон); само PR към default клона; лимити и одобрение за непознати автори; head само от refs/pull/<n>/head; D7.ci не блокира и изключва собствените check-ове по app_id (S11–S14, S24, F23). Симо: по подразбиране author_association ∈ {OWNER, MEMBER, COLLABORATOR} се проверяват автоматично.

## D-238
Лицензна граница: npmAllowlistFromLockfile и Gate типовете в @mandat/contract; bin mandat-verify в packages/verify (Apache); cli е GPL псевдоним; тестът гледа и workspace зависимостите (F6, F7). Решено.

## D-239
MCP сървърът се пуска през serveStdio (двете ери на протокола); тестове за initialize 2025-11-25 и server/discover 2026-07-28 (F1). Решено.

# Решения на кодера от демо промпта (D-260+)

## D-260 Docker тестът на пясъчника се мести в apps/worker (20.10.2026)
Решение: packages/sandbox/src/sandbox.docker.test.ts → apps/worker/src/sandbox.docker.test.ts; vitest проектът „sandbox“ в vitest.docker.config.ts отпада (тестът е в проекта „worker“). Правилото „ядрото импортира само ядро“ важи и за тестовите файлове в src/.
Защо: тестът импортира @mandat/worker и @mandat/channels (харнес); license-groups.test.ts го откри. Тестовете са част от изходния код на пакета.
Алтернативи: изключение за *.test.ts от правилото (по-слабо).
Източник: демо промпт т. 4 (тестове). Статус: решено.

## D-261 check-test-counts: JSON отчети в test-results/ (20.10.2026)
Решение: vitest.config.ts и vitest.docker.config.ts пишат JSON отчет (reporters default + json, includeTaskLocation) в test-results/unit.json и test-results/docker.json (в .gitignore); passWithNoTests: false в двата конфига. `pnpm test:counts` (scripts/check-test-counts.mjs) е в `pnpm check` след `pnpm test`. Коментарът `// D-2xx:` се търси на реда на теста или над него, или над обграждащ `describe.skip(...)`. Липсващ docker отчет: локално → „SKIPPED: docker: не е пускан“; при CI=true → exit 1.
Защо: т. 0.3 (е) — skip без решение не може да мине тихо; Docker тестовете без Docker не се броят за минали.
Алтернативи: отделен reporter модул (повече код).
Източник: демо промпт т. 0.3 (е). Статус: решено.

## D-262 Метод на проверката на лицензите по групи (20.10.2026)
Решение: за всеки workspace пакет `pnpm licenses list --json --prod` в неговата директория + обединение по затварянето на `workspace:*` зависимостите му; проверка срещу групата му (license-allowlist.json по групи). Dev списъкът (`--recursive` от корена) се проверява срещу harness.allowed + devOnlyExceptions (dev зависимостите не се разпространяват). Групите са в scripts/license-groups.mjs; пакет без група → fail. Форматът на `pnpm licenses list --json` е проверен в E0 (fixtures/licenses/pnpm-12.14.0*.json, D-077).
Защо: т. 4.2; методът на E0 остава.
Алтернативи: собствен обход на pnpm-lock.yaml (повече код, дублира pnpm).
Източник: демо промпт т. 4.2. Статус: решено.

## D-263 NOTICE на ядрото (20.10.2026)
Решение: NOTICE = „Mandat <пакет>\nCopyright 2026 Simeon Sabev\n\nLicensed under the Apache License, Version 2.0 (see LICENSE).“; contract добавя ред за canonicalize (единствената Apache-2.0 prod зависимост в ядрото; пакетът няма собствен NOTICE файл). LICENSE е каноничният текст от apache.org (sha256 cfc7749b…3d30), проверен в теста. set-core-license.mjs пише ред между `<!-- mandat-license:begin/end -->` в packages/<p>/README.md само при dual.
Защо: т. 4.2.
Алтернативи: —
Източник: демо промпт т. 4.2. Статус: решено.

## D-264 Спецификацията (10 файла) липсва в docs/spec (20.10.2026)
Решение: в docs/spec има само двата промпта; /home/user/claude не съществува. Работя по текста на промптите; където промптът препраща към „спец. т. N“ без да дава съдържанието, взимам минималния вариант, нужен за демото, и го записвам като D-26x „отворено за Симо“ (Q-018).
Защо: т. 0.6 („работиш по този текст и E0; пишеш „чака Симо: docs/spec“ в progress“).
Алтернативи: —
Източник: демо промпт т. 0.6. Статус: отворено за Симо.

## D-265 `.mandat.yml` v2: съдържанието на блоковете (20.10.2026)
Решение: схемата в packages/contract/src/policy.ts (version 2; runtime{node, package_manager, install}; tests{framework, command, env, test_globs}; ci{provider, workflow, required_checks}|null; task_types{<type>: allowed_paths, may_change_tests, risk_class}; risk_classes{low|medium|high: level_cap, requires_second_factor}; protected_paths; protected_json_fields; config_paths; budgets{task_usd, task_minutes, org_usd_day?}; models{allowed, default}; harness{required_detectors, max_level}; security{max_file_mb, max_diff_mb, max_files}), `.strict()` навсякъде. Парсер `yaml` 2.9.1: core schema, без custom тагове, без merge keys, без aliases (maxAliasCount 0), уникални ключове; всяко предупреждение е грешка. Пълният пример от спец. т. 5.2 липсва (D-264).
Защо: т. 5.6 дава имената на блоковете, не съдържанието им.
Алтернативи: —
Източник: демо промпт т. 5.6. Статус: отворено за Симо (сверка със спец. т. 5.2 след Q-018).

## D-266 Миграциите: колоните са минимумът на кодера; loadPolicyFromBase е във verify (20.10.2026)
Решение: supabase/migrations/2026102000000{1,2,3}_*.sql — таблиците от т. 5.2 с колоните, които кодът на демото ползва; `private` схема за всички SECURITY DEFINER функции (search_path = '', REVOKE от public/anon/authenticated); RLS + FORCE RLS на всички таблици; членство и роли от public.members (Custom Access Token Hook не е направен — [НП], ролите се четат от таблицата в private.authorize). Четенето на политиката от огледалото (git) е в packages/verify (readAtBase), не в contract: contract остава без I/O.
Защо: спец. т. 11 липсва (D-264); contract е чист.
Алтернативи: JWT claims от hook-а (по-бързо, но иска конфигурация, която не мога да проверя).
Източник: демо промпт т. 5.2, 5.3, 5.6. Статус: отворено за Симо.

## D-267 private.ledger_append(org, kind, task_id, payload_jcs, payload_hash) (20.10.2026)
Решение: подписът има и task_id (E0 формулата го хешира). `hash` от т. 5.4 = sha256 на payload_jcs („sha256:<hex>“); функцията го пресмята с pgcrypto и отказва при разлика; seq, ts (ISO UTC с ms) и prev_hash ги определя тя под pg_advisory_xact_lock по org; entry hash = sha256(JCS({kind, org_id, payload_hash, prev_hash, seq, task_id, ts})) — същото като E0. Таблицата е само за добавяне: REVOKE INSERT/UPDATE/DELETE/TRUNCATE + тригер. `verify-log --org` сверява и JCS(payload) == payload_jcs (ledger/src/online.ts).
Защо: TS не знае seq/prev_hash преди заключването.
Алтернативи: TS чете последния ред и праща целия hash (race между двама писачи).
Източник: демо промпт т. 5.4. Статус: решено.

## D-268 D2: ред на report_mismatch; поведение на weakened_assertions (20.10.2026)
Решение: report_mismatch е последен в реда на D-103 (не е зададен в т. 5.7) и е unknown. weakened_assertions по AST (typescript 6.0.3): брой expect/assert* в тялото + в локални helper функции (едно ниво); слети expect в един toEqual/toStrictEqual/toMatchObject с обект/масив с ≥ (разлика + 1) елемента → unknown (записано в d2-weakened-fp.test.ts); `.each` и тестове в цикли/forEach не се сравняват; преименуван тест → само missing_test. passed → passed с по-слаб assertion (toBe(45) → toBe(50)) не се хваща — известна граница.
Защо: т. 5.7 оставя тези детайли на кодера ([О]).
Алтернативи: babel parser (нова зависимост).
Източник: демо промпт т. 5.7, D-233. Статус: решено.

## D-269 Присъда без договор (външна/CLI/MCP) (20.10.2026)
Решение: task_id = `t_ext_<първите 12 hex на diff_hash>`; contract_hash = hashJcs({req, config_hash}); при недоверен base base_sha/tree_sha = 40 нули (схемата иска SHA). Ключ на агента за CLI = `external:mcp-local` (AgentKey няма „cli“), level_cap 1, без стълба (ladder = без ограничение в effectiveLevel, ladder_level 0 в изхода). Без --type: risk cap 1, D4 n/a („no task type“), may_change_tests false (F15). MUST_PASS и CANARY n/a. Политика, която изисква D5/D6/D8 → FAILED INFRA:detector_missing; pnpm/jest → UNKNOWN INFRA:unsupported_runner. `.mandat.yml` е винаги в protected_paths и config_paths (К-1).
Защо: VerifyOutcome иска Verdict със задължителни полета.
Алтернативи: отделна схема за външни присъди (втори тип присъда — против т. 3.1).
Източник: демо промпт т. 3.3, 5.7, D-206. Статус: отворено за Симо (част от Q-003).

## D-270 mandat-verify: дом и история (20.10.2026)
Решение: --home, иначе MANDAT_HOME, иначе ~/.mandat. Огледалата: $home/mirrors/<sha256(url)[0:16]>.git; доверения base се пази като refs/heads/mandat/base (за cleanClone на E0) и refs/mandat/trusted/<D>; HEAD на агента — refs/mandat/agent/head. Историята за S27 е $home/verify/history.jsonl (ключ base_sha, tree_sha, config_hash); в онлайн режим — таблицата verdicts (индекс verdicts_key).
Защо: т. 5.7 (2), S27.
Алтернативи: —
Източник: демо промпт т. 5.7, 3.4. Статус: решено.

## D-271 `mandat run` ползва verifyTrees, не целия verifyChange (20.10.2026)
Решение: проверката (baseline кеш, H/A/B, D10, D3, D4, D1, D2 с A/AST/declared, MUST_PASS) е една функция `verifyTrees` в packages/verify, която ползват и `mandat run`, и verifyChange. `mandat run` (E0, договор от файл) запазва своя износ/CANARY/INTEGRITY. Онлайн worker-ът (E1в, с GitHub) ще вика verifyChange.
Защо: E0 тестовете и bench остават непроменени; няма втори път за детекторите.
Алтернативи: пълен преход на runTask към verifyChange сега (рисков рефакторинг без нова функционалност).
Източник: демо промпт т. 3.1. Статус: отворено за Симо (т. 3.1 иска една функция за всичко).

## D-272 Unit тестовете на mandat-verify симулират vitest (20.10.2026)
Решение: shop-sim.test-helper.ts строи vitest JSON отчет от файловете на дървото (статичен парс + правило за „applies 10% over 50“); истинският път с Docker е verify-cli.docker.test.ts.
Защо: unit тестовете без Docker покриват доверения base, К-1, F12, F15, S27 и no-write.
Алтернативи: —
Източник: решение на кодера. Статус: решено.

## D-273 MANDAT_DB_URL (НОВО env име) (20.10.2026)
Решение: worker-ът и CLI (`verify-log --org`, `anchor --org`, `demo seed`) се свързват с Postgres по MANDAT_DB_URL; без него — локалният Supabase по подразбиране postgresql://postgres:postgres@127.0.0.1:54322/postgres (публична стойност на CLI-то, не тайна). Името е в .env.example.
Защо: т. 0.7 няма име за DB URL на worker-а (има SUPABASE_URL за REST и SUPABASE_DB_PASSWORD).
Алтернативи: сглобяване от SUPABASE_DB_PASSWORD + хост (повече env логика).
Източник: решение на кодера. Статус: отворено за Симо.

## D-274 Обход за `supabase start`: PGlite + postgres:17.6-alpine (20.10.2026)
Решение: виж docs/blockers/supabase-start.md. `pnpm test:db` пуска миграциите и pgTAP файловете в PGlite с shim; `pnpm test:db:supabase` е истинският `supabase test db`. Паралелните неща (advisory lock, SKIP LOCKED) се проверяват срещу истински Postgres в Docker. Нови dev зависимости: supabase 2.119.0 (MIT), @electric-sql/pglite 0.5.8 (Apache-2.0), @electric-sql/pglite-pgtap 0.0.9 (Apache-2.0).
Защо: т. 0.3 (ж) — обходът е документиран; фазата не е БЛОКИРАНА.
Алтернативи: само Postgres контейнер без pgTAP (по-малко покритие на RLS матрицата).
Източник: демо промпт т. 5.1, 0.3 (ж). Статус: отворено за Симо (Q-022). Обновление: `supabase start` мина на втория опит; `pnpm test:db:supabase` (psql) → 38/38 на истинската база; само `supabase test db` (pg_prove образ) остава недостъпен тук.

## D-275 Daemon-ът на worker-а (MANDAT_MODE=worker) влиза в E3а (20.10.2026)
Решение: в E1б са чистите части на т. 5.8 — преходите на state machine (state.ts), решението на sweeper-а (lease.ts), outbox (MemoryOutbox + PgOutbox) и стъпковите ключове. Цикълът, който взима задачи от task_steps, пуска runTask и пише присъди в базата, се прави в E3а, когато има UI, което създава задачи.
Защо: в E1б няма източник на задачи; „Готово, когато“ на E1б не го изисква.
Алтернативи: —
Източник: демо промпт т. 5.8. Статус: отворено за Симо.

## D-276 Live тестове без env (20.10.2026)
Решение: *.live.test.ts са в отделен vitest проект (vitest.live.config.ts, `pnpm test:live`); без env са `it.skipIf(...)` с коментар `// D-276:` и check-test-counts ги изброява като НЕПОКРИТИ, без да прави фазата ЧАСТИЧНО (статусът става „ГОТОВО (live чака Симо)“). Липсващ live отчет не е грешка.
Защо: т. 0.5 / D-228 — SKIPPED никога не е минал, но не е и провал на кода.
Алтернативи: —
Източник: демо промпт т. 0.3 (е), 0.5. Статус: решено.

## D-277 `security.external_agents` в `.mandat.yml` (20.10.2026)
Решение: незадължителен масив от GitHub user id (≤ 100) в блока security; чете се само от default клона (доверения връх в огледалото), никога от PR. Автор с id в списъка се проверява автоматично (S13).
Защо: т. 6.4 го споменава като `policy.security.external_agents`, без схема.
Алтернативи: login вместо id (login се преименува и преизползва, S38).
Източник: демо промпт т. 6.4. Статус: решено.

## D-278 Ефектите към GitHub от outbox (20.10.2026)
Решение: githubEffectHandlers: check_run/approval_check → createOrUpdateCheckRun (идемпотентно по external_id + name + head_sha); ready_for_review → markReadyForReview; merge → mergePull със sha; 405 при повторно сливане се приема (вече слято или блокирано — състоянието се препрочита от вратата), 409 и останалите → грешка и повторен опит по outbox. Сливането в autoMerge е синхронно (иска отговора за 409/405 → MIXED/HELD); outbox пази само след-ефектите.
Защо: T3-2; повторен drain след срив не дублира ефект (outbox-github.test.ts).
Алтернативи: —
Източник: демо промпт т. 3.4, 6.3. Статус: решено.

## D-279 fetchPullHead в Octokit адаптера (20.10.2026)
Решение: `git fetch --no-tags --end-of-options https://github.com/<repo>.git +refs/pull/<n>/head:refs/mandat/pr/<n>` в огледалото на Мандат, без токен. За частно хранилище трябва installation token в http.extraHeader — не е направено (демо хранилището е публично).
Защо: S14 — head само от base репото; без токен в URL/лог.
Алтернативи: токен в URL (изтича в логове).
Източник: демо промпт т. 6.4. Статус: отворено за Симо (Q-023).

## D-280 Свързването на вратата в daemon-а е с него в E3а (20.10.2026)
Решение: в E1в са функциите (deliver, autoMerge, humanApproved, externalPrVerdict, intake, webhook приемник, outbox handlers) и тестовете им с fakeGitHub; цикълът „webhook/polling → опашка → externalPrVerdict → outbox“ и „VERDICT → GATED → deliver“ се пуска от daemon-а на worker-а (D-275) в E3а.
Защо: един daemon, не два.
Алтернативи: —
Източник: демо промпт т. 5.8, 6.4, 6.5. Статус: отворено за Симо.

## D-281 verifyd не приема remote от клиента (20.10.2026)
Решение: заявката `verify` през сокета носи само repo и task_type; verifyd има собствени `--allow/--remote` двойки (в systemd unit-а на потребителя `mandat`) и закрепя base-а от тях. MCP сървърът подава `--remote` само в режим `--same-uid` (в процеса). Ключ за дедупликация „същото дърво“: HEAD + списъкът файлове на работното дърво с размер и mtime (само четене, D-270), вместо (base_sha, tree_sha), които не се знаят преди износа.
Защо: агентът е в групата на сокета и може да говори с verifyd направо; ако remote идваше от заявката, той би закрепил свой base (S1).
Алтернативи: подписани заявки от MCP сървъра (агентът има същия uid като сървъра — безполезно).
Източник: демо промпт т. 7.3. Статус: решено.

## D-282 mcp-isolation в облачната сесия (20.10.2026)
Решение: тестът пуска процеса на „агента“ с `setpriv --reuid=65534` (nobody) срещу $MANDAT_HOME на verifyd (0700) → Permission denied; без root/setpriv тестът е SKIPPED с `// D-282:`. Пълната изолация (rootless Docker на `mandat`, агентът без група docker) е по docs/setup/verifyd.md при Симо.
Защо: т. 7.5 иска „контейнер с два потребителя“ в CI; тук средата е root.
Алтернативи: —
Източник: демо промпт т. 7.5. Статус: решено.

## D-283 MCP резултатите са JSON в text content (20.10.2026)
Решение: инструментите връщат `content: [{type:"text", text: JSON}]` без outputSchema/structuredContent; грешка → `isError: true` с `{error}`. Работи и в двете ери (2025-11-25 и 2026-07-28) и с SDK клиента (auto → modern, default → legacy; тест).
Защо: т. 7.1 позволява този вариант; по-малко разлики между клиентите.
Алтернативи: outputSchema (несигурно поведение в по-старите клиенти).
Източник: демо промпт т. 7.1. Статус: решено.

## D-284 Лицензи на apps/web: caniuse-lite и sharp (20.10.2026)
Решение: (1) `license-allowlist.json` получава `harness.prodExceptions` — изключение по **име на пакет + точен лиценз** (caniuse-lite, CC-BY-4.0), само в групата harness; ядрото не се разширява (тест в scripts.test.ts). (2) `pnpm-workspace.yaml: ignoredOptionalDependencies: [sharp]` — next тегли sharp/libvips (LGPL-3.0-or-later) като optional; UI-то ползва `images.unoptimized: true`.
Защо: caniuse-lite е таблица с данни, без която `next build` не тръгва; CC-BY-4.0 иска само атрибуция (в THIRD_PARTY). Глобално разрешаване на CC-BY-4.0 в prod би пропуснало и други пакети незабелязано.
Алтернативи: Vite вместо Next (промптът изисква Next/Vercel); глобален CC-BY-4.0 (по-широко от нужното).
Източник: демо промпт т. 8.1, AGENTS.md правило 8; https://pnpm.io/settings#ignoredoptionaldependencies (20.10.2026). Статус: отворено за Симо (Q-024).

## D-285 apps/web: четене под RLS, писане през service_role, локален демо вход (20.10.2026)
Решение: (1) Server Components и GET Route Handlers четат с `pg` в транзакция `set local role authenticated` + `request.jwt.claims` = потребителя (същото, което прави PostgREST) — RLS решава какво вижда viewer (без diff/task_activities, миграция 0005). (2) POST действията проверяват ролята със самоличността на потребителя (`private.authorize`), после ЕДНА транзакция като `service_role` (одобрение = `private.approve_changeset` + approval_needed=false + състояние на задачата). (3) Вход: Supabase Auth (@supabase/ssr бисквитки) по подразбиране; `MANDAT_DEMO_DEV_AUTH=1` → локален вход срещу `auth.users.encrypted_password` (bcrypt, същите редове, които ползва GoTrue) през `private.dev_login` (security definer, само service_role) + HMAC бисквитка; втори фактор: TOTP (RFC 6238) с тайна в `private.dev_totp`; при Supabase — `mfa.challenge` + `mfa.verify`. (4) CSRF: double submit (`mandat_csrf` бисквитка ↔ `x-mandat-csrf`) + Origin; тяло ≤ 1 MB; POST /api/tasks ≤ 10/мин в процеса. (5) Тайната за сесията без env е на `globalThis` (Next bundle-ва route handlers и страниците отделно — бъг, хванат с curl, тест в session.test.ts). (6) Default exports само за page/layout и Playwright globalSetup (eslint изключение).
Защо: т. 8.1 иска „ЕДНА транзакция“ и роля с JWT на потребителя; supabase-js заявки една след друга са забранени. Dev входът е заместителят по т. 0.5, ако Auth не е наличен; e2e върви на него (без GoTrue MFA enrollment).
Алтернативи: supabase-js от сървъра с потребителския JWT (повече мрежови ходове, без транзакция); NextAuth (нова зависимост).
Източник: демо промпт т. 8.1, спец. т. 11–12, S08, S22, S23. Статус: решено.

## D-286 Тълкувания в E3а (20.10.2026)
Решение: (1) admin@demo = втори owner (members.role няма 'admin'). (2) failure_layer (т. 2.2 №10): D1/D4/MUST_PASS/D7 → „проверка“; INFRA → „инфраструктура“; POLICY → „политика“; останалите (D2, D3, CANARY…) → „агент“. (3) `seq` в задачата е брояч на задачата, не глобален; „reconnect → since“ е `GET /api/board?since=<ISO време от предния отговор>` (updated_at), не since_seq. (4) Тестове „B x/y“ = инвентарът след промяната спрямо base (D2.inventory after/before), A = D1.base_tests. (5) Одобрено → задачата отива в GATED без човек (колона 3) до доставката от outbox; отказ → CLOSED, wait_reason 'rejected'. (6) SUPABASE_SERVICE_ROLE_KEY в cli `worker` командата се чете вече през `broadcasterFromEnv` в apps/worker (статичният тест не допуска друго).
Защо: спецификацията не уточнява тези точки; изборите са най-малкото, което изпълнява т. 8.1.
Алтернативи: глобален seq (нова последователност в tasks) — по-сложно без полза за демото.
Източник: демо промпт т. 8.1, т. 2.2. Статус: отворено за Симо (Q-025).

## D-287 Авто-харнесът в E3б (20.10.2026)
Решение: (1) packages/onboard (GPL) е чист: scanRepo(RepoView) → propose() → YAML (zod-валиден, без source) + field_sources; `annotate()` слага `# source: …` за `mandat init` и за комитнатия файл. (2) Сканерът чете само имена на файлове с тайни (dirView отказва да чете съдържанието им и не следва symlink). (3) Предложение за pnpm/yarn/jest е валиден YAML, но needs_human „runner …“: пясъчникът на E0 изпълнява само npm + vitest + node 24 (repoConfigFromPolicy). (4) „D3 проверява generated_hash“ = генерираните .mandat.yml, AGENTS.md, CLAUDE.md са винаги в protected_paths и config_paths → D3 unknown → UNKNOWN, ниво ≤ 1 (d3-generated-hash.test, fake:touch-config в Docker); хешовете се пазят в harness_proposals.generated. (5) Одобрението генерира файловете в Route Handler-а (onboard, без LLM) и ги подава на `private.approve_harness` (owner + TOTP ≤ 2 мин в базата, блок при невидими знаци, task_types, repos.config_hash/version, ledger config_change, outbox harness_pr) — една транзакция. (6) Съществуващ AGENTS.md/CLAUDE.md се пази в scan само ако няма невидими знаци (иначе одобрението е блокирано). (7) `mandat worker` вече изпразва outbox-а за harness_scan/harness_pr (SKIP LOCKED; другите видове остават pending). (8) Базовата линия (стъпка 4) е вход на propose() (0 теста → risk_cap 1, тест); в потока „Свържи“ не се пуска пясъчник (само скенер) — вж. отклоненията в доклада. (9) Drift: одобреният YAML (repos.config_hash) срещу .mandat.yml на доверения base; твърди → BLOCKED harness_stale, меки → task_activities маркер.
Защо: т. 8.2; К-1 (без авто-одобрение); Ф5 (без права/hooks/MCP в генерираното).
Алтернативи: отделна колона generated_hash в D3 (промяна на RepoConfig в contract и в E0 договора) — ненужно, защото protected_paths дава същия резултат.
Източник: демо промпт т. 8.2. Статус: отворено за Симо (Q-026).

## D-288 Канали, преливане и Codex в E3в (20.10.2026)
Решение: (1) packages/channels: selectChannel (филтър health/cooldown/бюджет < est × 1,5; score 0,5·Q + 0,3·(1 − C) + 0,2·H; равенство → least-used → label), onLimit (retry-after ≤ 5 мин → чакане до 3 пъти; иначе cooldown до resets_at или 60 s → ×2 → 1 ч; cli_profile на друг доставчик → api_key → HELD; най-много едно преливане), validateChain/manualSwitchAllowed (без втори абонаментен профил на същия доставчик; един api_key на доставчик във веригата; непознат канал). (2) Лимитът се вижда от проксито: при 429 то записва {retry_after_s, resets_at} от заглавките (retry-after, anthropic-ratelimit-*-reset, x-ratelimit-reset-*) в usage на опита → RunTaskOutput.limit → веригата в daemon-а; веригата тръгва при limit И грешка на агента (празна промяна в runTask на E0 може да е VERIFIED). (3) Празна промяна (EXPORT „0 file(s) changed“) с VERIFIED → HELD empty_change онлайн: без доставка и без кредит в стълбата (иначе бездействие качва нивото). (4) Токенът носи доставчика (claim `p`, липса = anthropic); токен на друг канал → 401; /v1/responses отива към MANDAT_UPSTREAM_OPENAI с истинския OPENAI_API_KEY от env на проксито; цени на OpenAI от MANDAT_PROXY_OPENAI_PRICES ([НП], Симо) — без цена → model_not_allowed. (5) Websocket: gate-ът и проксито отказват Upgrade с 403. (6) @openai/codex 0.160.1 е в образа на пясъчника: двата tarball-а по integrity (npm pack + sha512), платформеният се разпакетира в node_modules/@openai/codex-linux-<arch> без install скрипт; `codex --version` → codex-cli 0.160.1. (7) JSONL fixtures на Codex и SSE на Responses са синтетични по exec_events.rs и документацията, докато S-CX не запише истински (SKIPPED: няма OPENAI_API_KEY). (8) Агент след преливане: claude ↔ codex; fake:<s> → fake-codex:<s>, ако има такъв сценарий, иначе fake-codex:honest-fix (само за fake). (9) Частичният diff на прекъснатия опит се пази като артефакт (байтове в ledger channel_spill), но НЕ се прилага в новия пясъчник (runTask на E0 взима base от огледалото); бележката в промпта се добавя само ако има частичен diff.
Защо: т. 8.3, Ф3 П4/П6, В-2; И1 (агентът никога не вижда истинския ключ).
Алтернативи: откриване на лимита от изхода на агента (зависи от формата на всеки CLI) — проксито е единствената обща точка.
Източник: демо промпт т. 8.3; github.com/openai/codex @ 4e7b9e2 (фактите в промпта, 19.10.2026); registry.npmjs.org/@openai/codex (20.10.2026). Статус: отворено за Симо (Q-027).

## D-289 PWA и web push в E3г (20.10.2026)
Решение: (1) app/manifest.ts + public/sw.js (push → showNotification; notificationclick → /tasks/<id>; без кеш на данни) + икони 192/512 (генерирани PNG). Инсталируемост: Chromium CDP Page.getInstallabilityErrors → [] в постоянен профил (Playwright по подразбиране е incognito → „in-incognito“). (2) Изпраща само worker-ът (outbox web_push при „Чака теб“, ПРОВАЛ, слято само на ниво ≥ 2). web-push строи само криптираната заявка (generateRequestDetails); изпращането е с наш транспорт: връзка към вече проверения IP (pinned lookup → без DNS rebinding), без редиректи (3xx → отказ), таймаут 10 s; 404/410 → абонаментът се трие. (3) SSRF (S18) при запис и при всяко изпращане: https, порт 443, хост по суфикс от allowlist, всеки IP публичен (вкл. 100.64/10, multicast, IPv4-mapped IPv6); MANDAT_PUSH_TEST_ENDPOINT само при NODE_ENV=test. (4) Payload: task_id, kind, заглавие ≤ 80 знака, дума на присъдата, ниво. (5) Без VAPID ключове → `[push] SKIPPED`; VAPID_PUBLIC_KEY отива към клиента (публичен), частният — само в worker-а (sentinel тест). (6) iOS: инструкция „Добави към началния екран“; разрешение само при клик. (7) Дъската на тесен екран: табове (линкове + scroll-snap).
Защо: т. 8.4, S18; И: сървърните ключове никога в клиента.
Алтернативи: webpush.sendNotification (собствен https.request без pinned IP и с непроверен адрес между проверката и изпращането).
Източник: демо промпт т. 8.4; README на web-push-libs/web-push; Next.js progressive-web-apps. Статус: решено (allowlist-ът — Q-029).

## D-290 Демото в E4 (20.10.2026)
Решение: (1) Детерминистичните агенти `fake:replay-claude` и `fake-codex:replay` печатат записа байт по байт и прилагат фиксиран patch (собствен applier: всеки hunk трябва да пасне точно веднъж); името идва като `[mandat-replay: <име>]` в договора от tasks.replay; записите и patch-овете са в образа (/opt/mandat/replay) и в хеша на тага му. Записите са **синтетични** и надписани (Симо записва живия транскрипт на сцена 3). (2) `demo/run.mjs` пуска сцените офлайн с истинския пясъчник, gate, детектори, стълба, outbox и fakeGitHub; базата е PGlite в процеса. Одобрението със TOTP в run.mjs се прави директно с `private.approve_changeset(…, 'totp', now())` (кодът се проверява в UI пътя — e2e). (3) Нови ефекти: deliveries за клон/PR (номерът на PR-а за „Отвори PR“ и ready_for_review), approval_check → „Мандат approval“ = success, humanMerged → OUTCOME → стълбата. (4) Сцена 3 върви през истинския MCP сървър (`--same-uid`); дървото на решенията е проверено в Docker и таблицата в demo/scene3.md показва реалните присъди (it.todo и „махнал expect“ се различават от [О] на т. 9.4, и двете са FAILED). (5) UI: рамката `<untrusted>` (за промптове) не се показва на хора — ID-то е «текст». (6) Видеото и скрийншотите са на UI състоянията на трите сцени (Playwright, офлайн), не на целия терминален поток. (7) deploy/: само caddy публикува 443; worker-ът ползва rootless Docker сокета на `mandat` (не сокет в пясъчника, правило 7 е за пясъчника).
Защо: т. 9; детерминизъм пред журито, всичко след агента е истинско.
Алтернативи: запис на целия UI с реален Supabase (зависи от Auth/MFA enrollment) — офлайн вариантът е по-надежден.
Източник: демо промпт т. 9.0–9.9. Статус: решено (живите варианти чакат Симо).

## D-291 CI на GitHub: отчетите по job и две точни изключения в gitleaks (20.10.2026)
Решение: (1) `check-test-counts.mjs` чете `MANDAT_COUNTS_REQUIRE` (списък от unit, docker, live): задължителните отчети. Без
променливата: unit винаги, docker при CI=true (D-261 непроменено). Job-ът `check` в .github/workflows/ci.yml е без Docker и
задава `MANDAT_COUNTS_REQUIRE=unit`; Docker тестовете минават/падат в job-а `docker-it`. (2) `.gitleaks.toml`: освен корпуса
(D-095) втори `[[allowlists]]` с `regexTarget = "secret"` и два котвени точни низа — примерният `Sec-WebSocket-Key` от
RFC 6455 §1.3 (`dGhlIHNhbXBsZSBub25jZQ==` = „the sample nonce“, тест на egress-gate) и SQL текстът `excluded.secret_b32`
(демо seed). Други пътища не се добавят; scripts/gitleaks-config.test.ts пази това.
Защо: първото пускане на CI на GitHub (20.10.2026) падна: check — „ГРЕШКА: docker: няма отчет“ (докер тестовете са в друг
job); gitleaks — 2 находки generic-api-key, и двете фалшиви и в историята (inline `gitleaks:allow` не покрива стари комити).
Алтернативи: `pnpm check` да пуска Docker в CI (дублира docker-it); пренаписване на историята — отхвърлено.
Източник: gitleaks v8.30.1 README (`[[allowlists]]`, `regexTarget`, `regexes`), https://raw.githubusercontent.com/gitleaks/gitleaks/v8.30.1/README.md, 20.10.2026; локално `gitleaks git .` → „no leaks found“ (149 комита). Статус: решено.

## D-292 Минимален харнес: нов дизайн, задача от UI, демо агенти, `pnpm local` (21.10.2026)
Решение (Симо, 21.10.2026: „махам забраната; искам пълен минимален дизайн с навързване и минимален харнес, който работи
най-основното, без допълнителни спецификации“): (1) D-219 е отменено: apps/web е на Tailwind v4 (tailwindcss +
@tailwindcss/postcss 4.3.3, само при build). (2) UI = вход, „Задачи“ (Чака теб / В работа / Готово), „Нова задача“ и картата
на задачата (статус на обикновен език, ход в 3 стъпки, проверките с човешки имена, diff, решение, дневник). Махнати от UI:
Дъска, Харнес, Канали, push/PWA контролите, превключвателят на темата (темата следва системата). API маршрутите остават.
(3) Агенти в формата: claude, codex (нужен ключ в проксито) и три демо агента без ключ — fake:honest-fix (→ проверено),
fake:delete-test и fake:skip-test (→ провал); същият пясъчник и същата присъда. (4) `pnpm local` (`mandat local`): Postgres
17.6 в Docker на 127.0.0.1:54329 с volume (shim + миграции, без Supabase CLI), seedLocal (един собственик ti@mandat.local,
нова парола при всяко пускане, печата се веднъж, в базата само bcrypt), образите (build при липса), `next start` + worker
в един процес; Ctrl+C спира всичко, базата остава. (5) Одобрена задача, която чака сливане (GATED), се показва „Одобрена“.
Защо: у Симо изпълнението беше трудно, дизайнът неизползваем, а от UI не можеше да се даде задача — нямаше жив Мандат.
Алтернативи: shadcn/ui (повече зависимости, не е нужно за 4 екрана); Supabase CLI локално (тежко, отделно инсталиране).
Източник: Tailwind v4 + PostCSS, https://tailwindcss.com/docs/installation/using-postcss, 21.10.2026. Статус: решено.

## D-293 Ключовете се въвеждат от UI и отиват само в проксито (21.10.2026)
Решение (Симо: „може ли да се вкарват ключове; ползвай готовите core функции“): (1) Страница „Ключове“ (само собственик):
Anthropic (задължителен, проксито не тръгва без него) и OpenAI (по желание). Пътят: браузър → POST /api/keys (Origin +
CSRF + owner) → контролен адрес на `mandat local` (127.0.0.1, случаен bearer токен, известен само на web сървъра) →
готовата `proxyStart` (force) → `docker run -e ANTHROPIC_API_KEY` (стойността само в env на docker процеса). Ключът не се
пише в базата, на диска, в лог или в отговор; агентът получава mdt_ токен (правило 2 непроменено). (2) Кои доставчици имат
ключ: публична env `MANDAT_PROXY_PROVIDERS` на контейнера, четена с Go шаблон, който печата само нея (`proxyProviders`);
прокси от стар образ = „няма ключ“ → въвежда се пак и проксито се пресъздава. (3) Проксито брои 401/403 от доставчика
(`authFailed` в usage, до worker-а по пътя на 429); daemon → HELD `key_rejected` („Ключът е отхвърлен“), повторение позволено.
(4) `ANTHROPIC_API_KEY=… pnpm local` пуска проксито веднъж от env; web, worker и `images build` никога не получават ключа в env.
(5) seedLocal добавя двата канала (claude → Anthropic, codex → OpenAI); `pnpm local` проверява и образа на проксито.
Защо: без ключ от UI нямаше истински агент; ключът да не живее извън проксито.
Алтернативи: ключ в базата с криптиране (D-224 го отлага; изисква KEK); Next сървърът да вика docker (смесва ролите).
Проверено: фалшив ключ във формат sk-ant → проксито тръгва, Claude Code в пясъчника → Anthropic 401 → „Ключът е отхвърлен“;
стойността не е в local.log, базата, .mandat/ и логовете на проксито. Истински ключ не е пускан. Статус: решено.

## D-294 Тесен CONNECT тунел във вратата (21.10.2026) — подготовка за Claude профил
Решение: GatePolicy получава незадължително `tunnels` (точни host:port, ≤ 8); вратата отваря CONNECT само към тях и само във
фаза agent, логва само host:port (вид `tunnel`), никога съдържанието; без `tunnels` поведението е като досега (D-100).
Защо: Claude абонаментът е разрешен само в непроменения Claude Code с вход през потока на Anthropic (code.claude.com/docs/en/legal-and-compliance, 21.10.2026); трафикът трябва да е TLS до Anthropic, без Мандат да вижда токена.
Чака Симо: дали профилът да се монтира в пясъчника на агента (изключение от правило 2) или Claude Code да работи извън пясъчника. Статус: тунелът е готов; профилът не е свързан.

## D-295 Абонаментни акаунти в харнеса, няколко наведнъж (21.10.2026)
Решение (Симо: „Мандат = съдията, харнес = цялото; харнесът да е като другите — вход в различни Subscription акаунти“):
(1) Вход: `pnpm mandat login --name <име>` пуска непроменения `claude auth login --claudeai` в терминала на потребителя
(потокът на Anthropic). Всеки акаунт = Docker volume `mandat-profile-claude-<име>` (етикет mandat.profile=1). Харнесът не
чете токена; чете само `claude auth status --json` (loggedIn, email, subscriptionType → етикет, адаптиран от T3 Code, MIT,
NOTICE). `pnpm mandat accounts` / `logout --name`. (2) Задача: агент `claude@<име>` → канал cli_profile
`claude-profile-<име>` (без прокси, без токен); volume-ът се монтира САМО в контейнера на агента на /home/agent/.claude-profile
(buildRunArgs отказва всяка друга роля/цел); env: CLAUDE_CONFIG_DIR, HTTPS_PROXY=http://egress-gate:80, без ANTHROPIC_*;
вратата отваря само CONNECT тунели (D-294) до api.anthropic.com, console.anthropic.com, platform.claude.com:443 [НП: кой
хост ползва refresh на токена — и двата са разрешени до първо живо пускане]. (3) Изтекъл/липсващ вход: CLI-то го казва в
изхода → authFailed → HELD key_rejected („Ключът е отхвърлен… Провери в „Акаунти““) [НП: точните текстове на Claude Code].
(4) AGENTS.md правило 2: изключение за абонамент. (5) UI: „Акаунти“ (списък и командата за вход), първият влязъл акаунт е
агентът по подразбиране в „Нова задача“. Съдията (Мандат) не се променя: присъдата пак е в отделен пясъчник върху доверения base.
Защо: Anthropic позволява абонамент само в непроменения Claude Code с вход през техния поток и забранява на приложения да
събират/посредничат токени (https://code.claude.com/docs/en/legal-and-compliance, 21.10.2026); T3 Code прави същото (CLAUDE_CONFIG_DIR).
Риск: агентът държи OAuth токена в пясъчника; мрежата му е само до Anthropic; diff-ът минава през редакцията.
Не е проверено на живо: самият вход (пуска го Симо), реална задача с абонамент, Codex (ChatGPT) акаунти — следващ ход.

## D-296 Харнесът се казва Хамут; Мандат е само съдията (21.10.2026)
Решение: приложението (уеб интерфейс, PWA, банерът на `pnpm local`, README) се казва **Хамут** („harness“ на български);
**Мандат** остава името на съдията: присъдата, стълбата, дневника, `mandat verify`, MCP и GitHub check-овете („Мандат verdict“).
Името е в една константа (apps/web/src/lib/brand.ts: HARNESS, JUDGE). Пакетите (@mandat/*) и CLI-то (`pnpm mandat`) не се
преименуват: това е вътрешно и счупва пътища без полза.
Защо: Симо, 21.10.2026 — „Мандат използвай за съдията, харнес за цялото“; изборът на име ми го остави („Ти ще кажеш“).
Лесно се сменя: една константа + README.

## D-297 Локалният собственик получава TOTP веднъж (21.10.2026)
Решение: `pnpm local` създава TOTP тайна за локалния акаунт само ако няма (private.dev_totp) и я печата ВЕДНЪЖ в терминала
(ключ + otpauth адрес), както паролата. Одобрението на правилата (авто-харнес, т. 8.2) иска нов код от собственика; без това
правилата не могат да се одобрят локално. Тайната не се показва в уеб интерфейса (който има сесията, не трябва да има и втория фактор).
Загубен код: `docker rm -f mandat-local-db && docker volume rm mandat-local-db` (нова база) — [следващ ход: `--reset-2fa`].

## D-298 Авто-харнесът, дъската, каналите и стълбата се връщат в минималния дизайн (21.10.2026)
Решение: (1) „Правила“ (/harness): сканирай → предложение, всяко поле с думи и „откъде“ (lockfile, CI, package.json, „потвърди ти“),
полетата за човек са отгоре в жълто, .mandat.yml се разгъва, одобрение с TOTP; stale правила → червено. (2) „Дъска“ (/board): 7 колони,
на телефон хоризонтално с snap; картата = статус, задача, агент, тестове A/B, стълба. (3) Каналите са в „Акаунти“ (здраве, разход,
лимит, нулиране) с обяснение на преливането. (4) Картата на задачата има „Защо да вярваш на резултата“: тестове преди → след,
стълбата на агента за този вид задача (+ история), записът в дневника.
Защо: Симо, 21.10.2026 — слабостта „минималният интерфейс показва само част“ трябва задължително да се оправи; това са функциите,
които другите харнеси нямат (доклад за 16-те харнеса). Бекендът е непроменен (E3а–E3в).

## D-299 Паралелни задачи и преглед на промяната по файл (21.10.2026)
Решение: (1) `mandat worker` пуска N цикъла за задачи едновременно (MANDAT_WORKER_SLOTS, 1–8; `pnpm local` = 2, иначе 1) и
ОТДЕЛЕН цикъл за ефектите (правила, одобрения, push), за да не чака одобрение зад дълга задача. Вземането е `for update skip locked`
(вече), всяко пускане има свой пясъчник, gate и мрежа (`mandat-net-<run>`, `mandat-gate-<run>`), проксито е общо и различава токените.
(2) Картата показва промяната по файл: обобщение (+/−, нов/променен/изтрит), отметка „тест“ за тестови файлове (червена при изтрит),
сгънато при > 4 файла.
Защо: слабостта „паралелността и прегледът на diff са по-бедни от Conductor и T3 Code“ (Симо, 21.10.2026). Граница: всяка задача пак
минава пясъчник + проверка, т.е. по-бавна е от worktree; паралелността скрива това, не го маха.

## D-300 Мутационна проверка D11.mutation (21.10.2026)
Решение: Мандат разваля нарочно променените редове на кода (не тестовете, не защитените файлове) и пуска тестовете пак.
(1) Чисто ядро (packages/core/src/d11.ts): добавените редове от diff-а; места = оператор или число извън низове и коментари
(=== ↔ !==, == ↔ !=, >= → >, <= → <, ` > ` → >=, ` < ` → <=, && ↔ ||, true ↔ false, ` + ` ↔ ` - `, число → 0, 0 → 1);
детерминирано (файл, ред, колона; първо по едно място на ред), до MAX_MUTANTS = 3. Число → 0, а не n+1: n+1 на граница често е
еквивалентно (праг 5000 срещу 5001 при тестове на 4999/5000/10000).
(2) Пускане: в същия пясъчник на дърво B, след тестовете, БЕЗ нов install: файлът на мутанта се записва (seed), тестовете вървят
с `--network none`, отчетът се трие преди всеки мутант (стар отчет не може да мине за нов), после оригиналът се връща.
(3) Убит = ненулев изход, timeout, счупен отчет или тест, минал на B, вече не минава. Оцелял → UNKNOWN `D11:survived:<път>:<ред>`
(никога FAILED: промяната може да е вярна, липсва доказателство). Непуснат мутант → UNKNOWN `D11:not_run`. Без места → n/a.
Мутантите вървят само ако B е минал чисто (иначе n/a: присъдата вече не е VERIFIED).
(4) Демо агент `fake:untested-extra`: поправка + функция без тест → UNKNOWN (Docker тест). Честната поправка остава VERIFIED:
истинските тестове убиват мутанта на прага (Docker тест, D11 pass).
Защо: Симо, 21.10.2026 избра „мутационна проверка“ за слабостта „семантична грешка при зелени тестове“. Цена: до 3 допълнителни
пускания на тестовете (без install), таймаут 3 мин всяко. Граница: хваща непроверени редове, не грешна логика, която тестовете
проверяват погрешно; репо без тестове остава D2:zero_tests.

## D-301 pnpm, yarn v1 и jest в пясъчника и в авто-харнеса (21.10.2026)
Решение: (1) RepoConfig.runtime.install е една от трите команди (npm ci / pnpm install --frozen-lockfile / yarn install
--frozen-lockfile, все с --ignore-scripts); `packageManagerOf` дава мениджъра; tests.format = vitest-json | jest-json (jest --json
има същата форма). repoConfigFromPolicy пуска npm/pnpm/yarn × vitest/jest на node 24; mocha, node --test, bun → unsupported_runner.
(2) Gate allowlist по lockfile (packages/contract/src/lockfiles.ts): pnpm-lock v9 (`name@version` + `resolution.integrity`
sha512; tarball/git/directory → отказ; повече от един importer = workspace → отказ), yarn v1 (`resolved` от registry.yarnpkg.com
или registry.npmjs.org → `/npm/<път>`, sha512 integrity; berry (`__metadata:`) → отказ). Същите правила в D10.
(3) Инсталиране: pnpm с флагове `--registry=http://egress-gate/npm/ --store-dir=/home/agent/.pnpm-store
--package-import-method=copy --config.manage-package-manager-versions=false` (pnpm 12 не взе регистъра от NPM_CONFIG_REGISTRY:
5788 DNS опита към registry.npmjs.org в gate лога — проверено); yarn v1: yarn.lock се насочва към gate-а само за install
и се връща байт по байт (не разчитаме yarn да смени хоста [НП]). (4) Образът mandat-sandbox има pnpm 12.14.0 и yarn 1.22.22,
закрепени по integrity; yarn-ът на базовия образ се маха. (5) Скенерът вече не иска човек за pnpm/yarn/jest; иска за monorepo.
Проверено в истинския пясъчник (runners.docker.test.ts): pnpm+jest и yarn+vitest — честна поправка VERIFIED (+ D11 pass),
изтрит тест FAILED D2:missing_test. Граница: workspaces/monorepo, yarn berry, bun, mocha — следващ ход.
Защо: Симо, 21.10.2026 — „авто-харнесът разбира само npm и vitest“ задължително да се оправи.

## D-302 По-леко първо пускане на `pnpm local` (21.10.2026)
Решение: (1) Преди да създаде нещо, `pnpm local` проверява компютъра и печата по ред на проверка с какво да се оправи:
Docker отговаря и е ≥ 25.0.5, ≥ 2 CPU за Docker, Node 24, свободно място (≥ 10 GB без образи, ≥ 2 GB с тях), порт 3000 свободен.
(2) Ходът е на 4 стъпки ([1/4] проверка, [2/4] база и демо репо, [3/4] образи, [4/4] прокси, уеб и worker). (3) Падне ли
строежът на образите, повтаря веднъж с MANDAT_SANDBOX_APT=0 (Debian огледалата трябват само за R14 инструментите, D-151);
падне ли пак, казва как се подава CA на фирмен прокси (MANDAT_EXTRA_CA_CERTS).
Защо: слабостта „иска Docker и е тежък при първото пускане“ (Симо, 21.10.2026). Docker остава задължителен: без него няма
пясъчник, а без пясъчник няма Мандат. Готовите образи не се публикуват (правило 3), затова първото пускане пак ги строи.

## D-303 Десктоп прозорец (Electron) около `pnpm local` (21.10.2026)
Решение: apps/desktop = Electron 44.9.0 обвивка. Пуска `pnpm local` (същият харнес, същият пясъчник), показва стъпките [n/4],
чете банера (адрес, имейл, парола, веднъж TOTP) без да го пише никъде, влиза сам (попълва формата за вход с JSON низове),
показва TOTP ключа веднъж в диалог, остава в tray („Отвори“, „Спри и излез“ → SIGINT към `pnpm local`). Сигурност на прозореца:
contextIsolation, без nodeIntegration, sandbox, навигация само в локалния адрес, нови прозорци забранени; API ключовете не
минават към детето (D-293). Извън pnpm workspace (собствен pnpm-workspace.yaml и lockfile), за да не сваля Electron при всеки
`pnpm install`; пуска се с `pnpm desktop`. pnpm 12.14.0 не пусна install скрипта на electron въпреки allowBuilds [НП: защо],
затова `pnpm desktop` вика `node node_modules/electron/install.js` изрично. Без пакетиране и публикуване (правило 3).
Проверено: build с истинските типове на Electron; стартира под Xvfb (екранът „Харнесът се пуска…“), а при липсващо място за образите
показва грешката от проверката. Тестове: чистата част (банер, стъпки, env, навигация, скрипт за вход).
Защо: Симо, 21.10.2026 избра „Electron обвивка“ за слабостта „няма десктоп приложение“.

## D-304 Харнесът остава без име засега (21.10.2026)
Решение: отменя името „Хамут“ от D-296. HARNESS = "" (apps/web/src/lib/brand.ts): заглавията са само името на страницата
(„Задачи“, „3 чакат“, „Вход“), логото е празен квадрат (за екранен четец „Начало“), PWA се казва „Задачи за AI агенти“,
банерът и десктопът пишат „харнесът“. Мандат си остава съдията (и издател на двуфакторния код: otpauth issuer=Mandat).
Защо: Симо, 21.10.2026 — „не остави харнес без име за сега … бланк навсякъде“. Име се слага на едно място.

## D-305 Нов вид на интерфейса: тъмно с приглушен лайм, идентична светла тема, 4 изгледа на главната (21.10.2026)
Решение: (1) Цветовете са токени в apps/web/src/app/globals.css (canvas, panel, raised, line, ink, mute, accent, ok, warn, bad, info, idle);
тъмна (по подразбиране), светла и „като системата“ имат едни и същи имена; тест сверява, че светлата и системната светла са едни и същи
стойности и че тъмната има същите ключове. Без сияние и наситени цветове: дизайнът H0–H7 е приглушен за дълга работа (Симо: „не толкова
пъстро и ярко“). (2) Темата и изгледът са бисквитки (theme, view; Path=/, 1 година); сървърът ги чете, затова няма проблясване. Сменят се
в /settings, темата и с бутон в страничната лента. (3) Шрифтове: Tektur (заглавия, числа, етикети), Geologica (текст), Martian Mono
(команди, пътища); собствени woff2 (latin + cyrillic), OFL-1.1. С lang="bg" браузърът показва българските форми на буквите. (4) Рамка:
страничната лента (секции, проектите със здраве, тема, изход) + горна лента с „+ Нова задача“. (5) Главната: поток (опашка → агенти →
Мандат → ти → готово), рой от шестоъгълници за всяка жива задача и 4 изгледа: Карта + проекти, Карта + колони, Проект (списък, числа,
задачи, ритъм 7 дни × 2 ч), Списък. ?project= отваря един проект. Чиста логика: lib/overview.ts, lib/prefs.ts (с тестове).
Проверено: unit, e2e 15/15 (a11y в тъмна и светла тема чрез бисквитката, смяна на темата, 4-те изгледа), снимки в двете теми.
Не е направено (няма данни в системата още): каталог на MCP/скилове/плъгини, нощна смяна, ресърч, отворени прозорци от H1–H6.
Защо: Симо, 21.10.2026 — „имплементирай го, не толкова пъстро, идентичен светъл режим, сменя се от настройки“.

## D-306 `mandat tui`: таблото в терминала (21.10.2026)
Решение: `pnpm mandat tui` чете локалната база на `pnpm local` (или MANDAT_DB_URL) и рисува дизайна 13/H7: поток (задачи → агенти →
мандат → ти → готово), рой ⬢ на живите задачи, панел за всеки проект (до 6; провал първи), лента с клавиши (1-6, tab, o = отвори
проекта в браузъра, r, q). Колоната идва от public.board_column (една истина с уеб интерфейса). Само за четене: решенията остават
в браузъра, защото може да искат втори фактор. Цветовете са тъмната тема (24-bit); NO_COLOR и `--once` (един кадър без цвят) за скриптове.
Проверено: unit (модел, рендер без и с цвят, ширина ≤ терминала), `--once` срещу истинската локална база.
Защо: Симо, 21.10.2026 — изглед 13 „за терминала, ако се ползва от там, но само за там“.

## D-307 Всички екрани от дизайна (H1–H6) със своите данни отзад; пример, докато не се записват (22.10.2026)
Решение: (1) Данни: таблици agent_sessions (с подагенти: role = subagent ⇔ parent_id), tool_calls, mcp_servers, skills, plugins,
tool_permissions, open_windows (само localhost адреси), night_shifts + night_queue, research_questions/sources/claims
(supabase/migrations/20261022000009_workbench.sql). RLS: всички с org_id, само четене за viewer+; пише worker-ът (service role);
pgTAP workbench_rls.test.sql (чужд org не вижда нищо, член не може да пише, подагент без родител и не-localhost прозорец се отказват).
(2) Договор: zod схеми в packages/contract/src/workbench.ts; обобщенията на повикванията минават redactSummary (без ключове,
токени, ≤ 300 знака). (3) Едно място за писане: apps/worker/src/online/workbench.ts (session, beat, end, toolCall, mcp, skill,
plugin, permission, window, planNight, queueNight, research) — валидира всичко преди базата; тестове на PGlite. Агентите още не го
викат: това е следващата стъпка (worker-ът да записва сесията и повикванията от потока на агента). (4) Четене в web под RLS:
lib/server/workbench.ts (fleet, tools, sessionOf, homeExtras, nightView, researchView). (5) Екрани: /agents (H2), /tools (H3),
сесията в картата на задачата (H4), /night (H5), /research (H6), на главната (H1): конфликт „2 агента пипат един файл“, цена днес,
MCP/мин и спрени от вратата, „Решения“ и „Отворени“. (6) Пример: където таблицата е празна, екранът показва примерни данни с етикет
„ПРИМЕР“ и името на таблицата, която ще го замени (lib/sample.ts); изключва се в Настройки (бисквитка sample=0). Твърденията в
примерния ресърч започват с „[ПРИМЕР]“. Бутоните на нощната смяна са изключени, докато няма worker за нея. (7) Анимация: тихи
течащи линии (поток на главната, глава на нощната смяна), пулс на работещите агенти, плавна поява на панелите; изключва се с
prefers-reduced-motion. Анимацията на появата е само движение, без прозрачност (axe мери контраста по време на анимацията).
Проверено: unit (договор, писач, четене, nightPlan, конфликти, дърво), pgTAP, e2e 17/17 (a11y на всички нови страници в двете
теми, пример видим/скрит), снимки в двете теми.
Защо: Симо, 22.10.2026 — „направи ги за сега където нямаме неща, но да имаме дизайна … и отзад да е готово за реалните функционалности“.

## D-308 PRD v1.1 за целия авто-харнес е одобрено от Симо с уточнения (22.10.2026)
Решение: docs/prd/PRD.md (v1.1) е продуктовата спецификация на целия харнес (12 възможности с критерии за приемане, потоци, NFR, метрики, рискове, план M0–M4, въпроси Q-030…Q-050). Симо одобри подразбиранията по всички въпроси с тези уточнения, приложени в PRD-то: (1) без времеви ограничения по етапите, готовност само по критерии (PRD-21); (2) ресърчът е услуга на харнеса с работен поток, MCP инструменти `research_*` и умение `research` за всеки свързан агент (раздел 6.13, спайк RS; PRD-18); (3) десктопът е професионално приложение от класа на Claude Desktop/ChatGPT Desktop върху същия UI код, Electron (PRD-13); (4) два езика, английски по подразбиране (PRD-22); (5) роли owner/worker/approver/agent-operator/viewer като данни с capabilities + персонализирани роли на собственика (PRD-19); (6) нощната смяна не спира при нерешим проблем: повторение → паркиране с въпрос и предложение в списъка на смяната (PRD-20); (7) името остава празно (D-304); (8) продуктът не праща абсолютно нищо към нас; статистика само от каналите за разпространение (изтегляния, инсталации, звезди) (PRD-15, L4). Изследването зад PRD-то е в docs/prd/research/ (факти с URL и дата; [НП] се проверяват преди код).
Защо: Симо, 22.10.2026: „за сега всичко, което ти си предложил, остава по въпросите“ + уточненията.
Алтернативи: описани при всяко решение в PRD-то (раздел 5.3).
Източник: съобщението на Симо в сесията, 22.10.2026. Статус: решено.

# v5 (имплементация на PRD v1.1; docs/spec/Харнес_v5_имплементация_промпт_кодер.md т. 8)

## D-309 (22.10.2026)
Решение: Имплементацията следва PRD v1.1 по фази E7–E11 = M0–M4; без времеви ограничения; „Готово, когато“ е единственият критерий (D-308). Решено.
Източник: v5 промпт т. 8 (22.10.2026).

## D-310 (22.10.2026)
Решение: Унифициран StreamEvent (т. 2.1) за всички адаптери; подагентите са сесии с parent; beats ≤ 2/s. Решено.
Източник: v5 промпт т. 8 (22.10.2026).

## D-311 (22.10.2026)
Решение: Контролен слой /m/in/harness (ro) с Materialized от компилатора; видим слой в репото без права/куки/MCP/тайни; промяна на видимия слой от агента → D3. Решено (PRD-2).
Източник: v5 промпт т. 8 (22.10.2026).

## D-312 (22.10.2026)
Решение: Механизмът на контролния слой за Claude Code (A срещу B) се решава от SH2; Codex: сийд в CODEX_HOME + хеш след края. Техническо, отворено.
Източник: v5 промпт т. 8 (22.10.2026).

## D-313 (22.10.2026)
Решение: Ключове: api_keys в private с AES-256-GCM и KEK (safeStorage | файл 0600 | env); проксито взима ключовете с еднократен boot токен; env без ключ. Решено (заменя D-224, D-055).
Източник: v5 промпт т. 8 (22.10.2026).

## D-314 (22.10.2026)
Решение: Базова линия при свързване (обръща D-287 (8)): асинхронна през outbox, две пускания, flaky списък. Решено.
Източник: v5 промпт т. 8 (22.10.2026).

## D-315 (22.10.2026)
Решение: Роли = данни с capabilities (т. 2.3); вградените не се редактират, копират се; RLS и Route Handler-и по has_cap. Решено (PRD-19).
Източник: v5 промпт т. 8 (22.10.2026).

## D-316 (22.10.2026)
Решение: „ask“ = отказ сега + HELD tool_approval с карти; синхронно питане е извън обхвата (пясъчникът няма мрежа към харнеса). Решено.
Източник: v5 промпт т. 8 (22.10.2026).

## D-317 (22.10.2026)
Решение: MCP stdio сървърите вървят в sidecar контейнер зад бридж stdio→streamable HTTP през вратата; дефинициите се хешират; промяна → блок. Техническо, отворено (дали CLI-тата говорят streamable HTTP без TLS в internal мрежа → docker тест в E8д; резерва: stdio в agent контейнера с hardening на процеса и без тайни).
Източник: v5 промпт т. 8 (22.10.2026).

## D-318 (22.10.2026)
Решение: Конфликт по файл при same_file=wait → по-късната задача SIGTERM → RETRY conflict след първата; никога не се пише в чужд пясъчник. Решено.
Източник: v5 промпт т. 8 (22.10.2026).

## D-319 (22.10.2026)
Решение: Rebase при изместен base = нов опит kind=rebase с нова присъда; конфликт → HELD base_moved; никога force. Решено (Ф2 минимум).
Източник: v5 промпт т. 8 (22.10.2026).

## D-320 (22.10.2026)
Решение: Нощна смяна: retry_then_park; parked задача + night_questions; смяната не спира освен при бюджет/инцидент. Решено (PRD-20).
Източник: v5 промпт т. 8 (22.10.2026).

## D-321 (22.10.2026)
Решение: D5 скрити тестове живеят в $MANDAT_HOME/hidden, качват се с TOTP, копират се само в дърво B. Решено.
Източник: v5 промпт т. 8 (22.10.2026).

## D-322 (22.10.2026)
Решение: D12 UI проверка е детерминистична (Playwright), дава само unknown; отделен образ mandat-sandbox-ui. Решено (PRD-12).
Източник: v5 промпт т. 8 (22.10.2026).

## D-323 (22.10.2026)
Решение: LLM-съветник е evidence REVIEW с таван (само надолу), изключен по подразбиране. Решено (PRD-1).
Източник: v5 промпт т. 8 (22.10.2026).

## D-324 (22.10.2026)
Решение: Ресърчът е sidecar услуга на харнеса (packages/research + research-mcp) през вратата; инструментите по т. 2.5; цитат = точен подниз; URL само от инструмент. Решено (PRD-18).
Източник: v5 промпт т. 8 (22.10.2026).

## D-325 (22.10.2026)
Решение: Архив на източниците (Wayback SPN2) само с ключ на Симо; без ключ — само хеш и локално копие. Симо: по подразбиране без ключ.
Източник: v5 промпт т. 8 (22.10.2026).

## D-326 (22.10.2026)
Решение: Езиков каталог без библиотека (типизирани записи), en източник, bg превод; статичен тест за низове извън каталога. Решено (PRD-22).
Източник: v5 промпт т. 8 (22.10.2026).

## D-327 (22.10.2026)
Решение: Десктоп: Electron + electron-builder + electron-updater; node-pty за терминала; подписването и публикуването са на Симо. Техническо, отворено (лицензи/версии по D-202).
Източник: v5 промпт т. 8 (22.10.2026).

## D-328 (22.10.2026)
Решение: Бюджет на API за v5: ≤ $2 на живо пускане, ≤ $25 общо. Симо: по подразбиране $25.
Източник: v5 промпт т. 8 (22.10.2026).

## D-329 (22.10.2026)
Решение: README.en.md (кратък) и docs/glossary.md двуезичен. Симо: по подразбиране да.
Източник: v5 промпт т. 8 (22.10.2026).

## D-330 (22.10.2026)
Решение: Нощен доклад по имейл (SMTP) изключен по подразбиране. Симо: по подразбиране изключен.
Източник: v5 промпт т. 8 (22.10.2026).

## D-331 (22.10.2026)
Решение: GitLab порт след стабилен GitHub на живо. Симо: по подразбиране в E9е, след L1–L4.
Източник: v5 промпт т. 8 (22.10.2026).

## D-332 (22.10.2026)
Решение: Примерните данни (lib/sample.ts) са изключени в production режим по подразбиране. Решено (U4).
Източник: v5 промпт т. 8 (22.10.2026).

## D-333 (22.10.2026)
Решение: Версиите на Claude Code/Codex в образа се вдигат само със спайк за argv/поток и по D-202. Решено.
Източник: v5 промпт т. 8 (22.10.2026).

## D-340 Клонове в облачната сесия: линейно в клона на сесията с таг phase/<код> (22.10.2026)
Решение: Работата по v5 върви линейно в клона на сесията (`claude/exciting-heisenberg-uekl8c`), който е единственият, който средата позволява да се пушне (D-141,
v5 т. 0.7 (в)). Всяка подфаза започва с комит, чието съобщение носи таг `[phase/<код>]` (напр. `[phase/e7a-live-spikes]`), и в края й локално се прави клон
`phase/<код>` на последния комит (линейна верига). Симо сравнява/слива по таговете.
Защо: в облака не се пушват други клонове; локалните клонове изчезват с контейнера, а тагът в съобщението остава.
Алтернативи: push на phase/* (средата го забранява).
Източник: v5 т. 0.2 (а), 0.7 (в). Статус: решено.

## D-341 Договорите на v5 (т. 2): уточнения на кодера (22.10.2026)
Решение: (1) Слой F е `{ roles: [...] }` (формата `.and().transform()` от т. 2.2 не се типизира добре; v5 го позволява).
(2) `ToolPattern` има префикс от затворен списък: `bash:`, `path:read:`, `path:write:`, `mcp:`, `net:`, `skill:`, `builtin:`,
`mandat:` (иначе грешно написано правило мълчаливо не би хванало нищо). (3) Слой G получава отсега копчетата на по-късните
фази с подразбиране: `wip_limit` 3, `ci_rounds` 2, `same_file` wait, `review` off, `hidden_tests_dir` tests/__hidden__,
`requires_research` [] — договорът не мърда после. (4) Новите детектори са именувани като старите: `D5.hidden`, `D8.static`,
`D12.ui`, `RESEARCH`, `REVIEW` (т. 2.6 казва "D5","D8","D12"). (5) `context_pct` при непознат прозорец на модела е `null`
(не 0, т. 2.1): 0% би казало „празен контекст“, а е „не знаем“. (6) `NightRules.on_fail` е `retry_then_park`; старите
стойности `stop`/`retry_once` се четат като новата (записите от D-307 остават валидни). (7) `SecurityEventKind` += `config_change`
(за SH2-CX). (8) Ресърч: 7-те инструмента по PRD 6.13 (`research_search/read/docs/code/ask/verify/recall`); `Quote.length`
трябва да е равна на дължината на текста; „потвърдено/един източник/противоречие“ изисква ≥ 1 цитат.
Защо: типове, които хващат грешките при писане, и стабилен договор за всички фази.
Алтернативи: буквално по т. 2 (по-слаби проверки). Източник: v5 т. 2, 0.3. Статус: решено.

## D-342 Абонаментът пуска Claude Code без `--bare` (22.10.2026)
Решение: Каналът PROFILE (D-295) пуска `claude -p …` без `--bare`, със `--setting-sources user` и `--strict-mcp-config`
(вариант B на SH2). Ключът (mdt_ токен) остава на `--bare`.
Защо: [Ф, docs/prd/research/anthropic.md ред 228 — code.claude.com/docs/en/headless, прочетено 22.10.2026]: „In bare mode,
Claude Code never reads OAuth credentials or the system keychain“. С `--bare` входът в абонамента не би сработил (S-SUB
още не е пускан на живо, затова не е било видяно).
Алтернативи: `CLAUDE_CODE_OAUTH_TOKEN` (setup-token) — също не се чете в bare и би сложил тайна в env на пясъчника (И1).
Източник: SH2 подготовка. Статус: решено (живото потвърждение: чеклист стъпка 9).

## D-343 Контролният слой на Claude Code до живия SH2 (22.10.2026)
Решение: временно — ключ: вариант A (`--bare` + `--settings /m/in/harness/claude/settings.json`); абонамент: вариант B (D-342).
Контролният слой е в `/m/in/harness` (root, файлове 0444, папки 0555), куките в образа `/opt/mandat/hooks` (0444, ro rootfs).
Живият SH2 (`node spikes/sh2-run.mjs`) решава окончателно: ако под A куката от изричния `--settings` не се изпълни → и ключът
минава на B. Инвариантът не зависи от изхода: вратата, D3, D4 и износът спират същото и без куката (куката е защита в дълбочина).
Защо: A е днешният проверен път; B е единственият за абонамент. [НП]: изпълнява ли bare куки от изричен --settings.
Алтернативи: CLAUDE_CONFIG_DIR=/m/in/harness (ro) по т. 3.1 (B) — [НП] CLI-то пише състояние в config папката си; за абонамента
тя е volume-ът на профила, затова контролният слой идва само през `--settings`.
Източник: v5 т. 3.1 SH2; docs/spikes/SH2.md. Статус: техническо, отворено (чака живия SH2).

## D-344 В облака: turbo с --concurrency=1 и образите преди всеки docker тест (22.10.2026)
Решение: В облачния контейнер `pnpm build` понякога пада с „Exec format error (os error 8)“ при паралелните деца на turbo; там
кодерът строи с `turbo run build --concurrency=1` (`pnpm check` на Симо не се променя). Тагът на образите е хеш на съдържанието,
затова преди `pnpm test:docker` винаги `pnpm mandat images build` (с MANDAT_SANDBOX_APT=0 и MANDAT_EXTRA_CA_CERTS).
Защо: средата (D-145) — без промяна на продукта. Алтернативи: —. Източник: тази сесия. Статус: решено.

## D-345 Ключовете към проксито: заключен старт + еднократен boot токен, подаден от CLI-то (22.10.2026)
Решение: (1) `mandat proxy start` взима ключовете от env на командата (и ги запечатва в `$MANDAT_HOME/keys.sealed.json`) или от
хранилището; минтва `mdt_boot_<32 байта>` и пуска контейнера само с него (`-e MANDAT_PROXY_BOOT_TOKEN`, стойността е в env на
docker CLI процеса, D-043). (2) Проксито стартира заключено (`/healthz` → `locked:true`, inference → 503 `proxy_locked`);
`POST /admin/boot` с токена (bearer, TTL 60 s от старта на процеса) приема ключовете веднъж; хешът на изразходвания токен се
пише в `/var/lib/mandat-proxy/boot-spent`, затова след рестарт на контейнера същият токен е невалиден → проксито остава
заключено, докато `pnpm local` (proxy-heal, на 30 s) не го пресъздаде с нов токен и запазените ключове. (3) KEK: env `MANDAT_KEK`
(base64 на 32 байта) или `$MANDAT_HOME/kek` (0600). (4) Онлайн: `private.api_keys` (само service role) + `private.store_api_key`
→ outbox `proxy_restart`; `pgKeyStore` в worker-а.
Защо: т. 3.3 иска проксито да *изтегли* ключовете от контролния адрес, но контейнерът на проксито е в мрежата mandat-upstream и
не стига до 127.0.0.1 на хоста; обратната посока (CLI → публикувания админ порт на 127.0.0.1) дава същите свойства без host
мрежа: ключът само в паметта, токенът еднократен и с TTL, `docker inspect` без ключ.
Алтернативи: `--network host` за проксито (разширява достъпа му); ключ във файл, монтиран ro (ключът на диска в чист вид).
Electron safeStorage за KEK — проверено в E9ж, вж. D-374 (документацията на Electron, прочетена 24.10.2026).
Източник: v5 т. 3.3. Статус: решено.

## D-346 Базова линия, flaky и рисков профил v1 (22.10.2026)
Решение: (1) `MandatPolicy.tests.flaky` и `RepoConfig.tests.flaky` са НЕзадължителни (без default), за да не се сменя
config_hash на съществуващите договори. (2) flaky = ID, чийто статус е различен в двете пускания на base (или липсва в едното);
невалиден отчет → нищо не се обявява за flaky. D1 не брои flaky ID-тата и ги изрежда в `data.flaky`. (3) Рисков профил v1:
папки migrations|infra|deploy|.github|auth|payment(s)|billing (на всяко ниво до 2) → `protected_paths` с source `rule:<име>`
(човек ги отпуска; „high ≤ 1 + втори фактор“ остава в risk_classes); bugfix върху src → medium (`rule:src`); docs → low.
(4) Базовата линия е асинхронна: сканирането добавя outbox `baseline`; worker-ът я пуска (MANDAT_BASELINE=0 я изключва) и
обновява предложението само докато е `proposed` (ledger config_change/baseline). (5) 0 теста → risk_cap 1 и предложена първа
задача „Add tests for the main module“ (feature). (6) Няколко инструкционни файла → `mergeInstructions` (дедупликация с произход,
невидими знаци махнати, опасни команди изпуснати, ≤ 24 реда) + разлика за човека.
Защо: v5 т. 3.4; защитените папки са по-строги от таван на нивото — безопасната посока, докато профилът (E8б) няма риск по път.
Алтернативи: таван по път (няма поле в MandatPolicy до E8б). Източник: v5 т. 3.4. Статус: решено.

## D-347 Сесията на живо: поток → workbench; терминалът е `session_lines` без xterm.js засега (22.10.2026)
Решение: (1) `runTask` подава всеки ред на агента като StreamEvent (`hooks.onStream`; провал в изгледа никога не спира задачата)
и usage от проксито (`hooks.onUsage`). (2) `sessionRecorder` (worker) пише през writer-а на workbench: сесия на лидера при първото
събитие, подагент със `parent_id` при първа поява, повикване на инструмент при резултата/отказа с решение, удар (beat) и
Realtime topic `session:<run_id>` най-много 2 в секунда на сесия; при край — край на сесията. (3) Терминалът на картата чете
`public.session_lines` (до 50 000 реда на сесия, след redaction, RLS по org); рендерира се на парчета от 500 реда с
`content-visibility: auto` вместо xterm.js — изходът няма ANSI (stream-json), а нова зависимост (правило 8) не носи стойност тук;
xterm.js влиза с истинския терминал на десктопа (E9ж, node-pty). (4) U4: без бисквитка примерът е изключен в production.
Защо: v5 т. 3.5; таблицата работи еднакво локално и hosted (уеб сървърът няма достъп до runs/ на worker-а в hosted режим).
Алтернативи: xterm.js 6.0.0 сега; четене на transcript.jsonl от диска (само локално). Източник: v5 т. 3.5. Статус: решено.

## D-348 Езиков каталог без библиотека; английски по подразбиране, български превод (22.10.2026)
Решение: (1) `apps/web/src/i18n/en.ts` е източникът (`as const`, `Key = keyof typeof en`), `bg.ts` е `Record<Key, string>`;
шаблони `{name}`, множествено число с двойка ключове `<база>.one`/`<база>.other`, избрана с `Intl.PluralRules`. (2) `t.ts` е
чист (`translate`, `plural`, `translator(lang)` → `t(key, params)` с `t.n`, `t.num`, `t.usd`, `t.locale`) и работи и на сървъра,
и в браузъра; `server.ts` (`getLang`/`getT`) чете бисквитката `lang` (en|bg), иначе първия поддържан език от Accept-Language
(по q), иначе en; `client.tsx` (`LangProvider`/`useT`) подава езика, който layout-ът е избрал, на клиентските компоненти;
`<html lang>` и manifest-ът следват езика. (3) Чистите функции в lib (статус, присъда, стълба, inbox, проекти, ритъм,
агенти, правила, нощен план) приемат `lang` с подразбиране "en", така API-то и тестовете остават детерминистични.
(4) Датите, часовете, числата, долари и относителното време са през Intl с локал en-GB (24-часов часовник, като дизайна) или
bg-BG. (5) Статичен тест `no-hardcoded-strings.test.ts`: кирилица в .ts/.tsx под apps/web/src извън каталога, тестовете и
lib/sample.ts → провал (и в коментарите, за да няма „скрит“ низ); кодовете на фазите в коментарите са с латиница (E7f = E7е,
F4 = Ф4). (6) Превключвател в /settings (бисквитка `lang` по модела на темата, `router.refresh()`); имената на езиците са на самия
език. (7) TUI (`packages/cli/src/i18n.ts`) и десктопът (`apps/desktop/src/i18n.ts`) имат собствен малък каталог със същия стил
на ключовете: `MANDAT_LANG`, иначе системният локал (LC_ALL/LC_MESSAGES/LANG, `app.getLocale()`), иначе en; десктопът подава
`MANDAT_LANG` на `pnpm local` и разпознава банера на двата езика. (8) Push: service worker-ът (public/sw.js) рендерира заглавието
и думата на присъдата по `kind`/`verdict` на езика на устройството. Остава (не е в обхвата на тази фаза, паралелна работа):
payload-ът в apps/worker/src/online/push.ts още носи български думи (sw.js ги разпознава), а съдържанието на lib/sample.ts
(етикетиран пример) не е преведено.
Защо: v5 т. 3.6, PRD AC-12.10 и U7, D-326 (без библиотека; без нова зависимост по правило 8). Типизираните ключове хващат
липсващ превод при билд, а тестът на каталога — празни стойности и изгубени `{параметри}`.
Алтернативи: next-intl / i18next (нова зависимост, ICU синтаксис, който не ни трябва за два езика); езикът в URL (/bg/…) —
сменя всички маршрути и e2e без полза за един човек; превод на lib/sample.ts сега — примерът изчезва с истинските данни.
Източник: v5 т. 3.6; PRD 4.1, 6.12 (AC-12.10), U7; Intl.PluralRules/RelativeTimeFormat (ECMA-402,
https://tc39.es/ecma402/, проверено 22.10.2026). Статус: решено.
## D-349 Роли като данни: `public.roles`, `members.role_id`, `has_cap` с обхват (22.10.2026)
Решение: (1) Вградените роли са редове `builtin:<име>` с `org_id null` (owner, worker, approver, agent-operator, viewer по v5 т. 2.3);
тригер забранява промяна/изтриване (копие → персонализирана роля с uuid id). (2) `members.role_id` (попълнено от старата
`role`); старата колона остава и се синхронизира с тригер (owner-подобна = има settings.manage; approver-подобна = approve.level1;
иначе viewer), за да не се чупят старите четци. (3) `private.cap_of(user, org, cap, repo?, type?, level?)` и
`private.has_cap(org, cap, …)` = за auth.uid(); `private.authorize(viewer|approver|owner)` вече е has_cap(diff.view |
approve.level1 | settings.manage) — така всички съществуващи RLS политики минават през capabilities без пренаписване.
(4) Обхватът (repos, task_types, level_cap) ограничава действия, които назовават repo/вид/ниво; проверка без тях („може ли да
вижда org-а“) не ги проверява — иначе роля „docs reviewer“ не би видяла нищо. (5) Одобрение: ниво ≥ 2 и „approved“ →
approve.level2, иначе approve.level1, с repo/вид/ниво на задачата; правилата на харнеса → approve.rules. (6) API: GET/POST
/api/roles (roles.manage), PATCH /api/roles/:id, PATCH /api/members/:id/role (members.manage); всяка промяна → ledger
`role_change`; org-ът винаги запазва поне един член с roles.manage. Ключовете → keys.manage.
Защо: v5 т. 4.3 / D-315; минимален риск за старите тестове (очакванията им не се променят).
Алтернативи: пренаписване на всяка политика с has_cap (същото поведение, много повече SQL). Източник: v5 т. 4.3. Статус: решено.

## D-350 Компилаторът на профила (`packages/profile`) и пътят до пясъчника (22.10.2026)
Решение: (1) `compileProfile(profile, target, {runId, subjects, skills})` е чиста функция; таблицата правило × цел
(`RULES`: native | harness | unsupported) е едно място, което ползват компилаторът и UI. (2) Claude Code: `claude/settings.json`
(permissions allow/deny/ask от слой C за субектите на задачата; `net:*` не влиза — налага го вратата), куки от слой D към
`/opt/mandat/hooks/*.mjs`, `pluginConfigs … instructionFiles: managed-only`; `claude/mcp.json` (всички сървъри през вратата:
`http://egress-gate/mcp/<name>`, освен изричен http URL); `claude/agents/<role>.md`; `claude/skills/<name>/SKILL.md` само с
одобрено съдържание (иначе `unsupported`); `instructions.md` (слой B + definition of done); `policy.json` за куките. argv:
`--settings … --mcp-config … --strict-mcp-config`; env: лимитите на подагентите от слой G (+ CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=3).
Под `--permission-mode dontAsk` всичко неодобрено се отказва, затова MCP инструментите на профила и командите му
(test/lint/typecheck) са в `permissions.allow`. (3) Codex: `codex/config.toml` (workspace-write, never, без мрежа,
`project_doc_max_bytes=0`, developer_instructions, MCP през вратата с enabled_tools, agents), `codex/hooks.json` [НП формат →
SH2-CX на живо], агенти, скилове; worker-ът копира `/m/in/harness/codex` в `/m/codex-home` (писаемо копие за CLI-то) и след
агента сравнява config.toml/hooks.json байт по байт → разлика = security_event `config_change` + AGENT unknown (SH2-CX).
(4) Gemini/local: само `instructions.md` + `policy.json`; останалото е `harness` или `unsupported` до E9в. (5) `runTask` получава
`profile` (и `subjects`), компилира, сийдва `/m/in/harness` (root, 0444/0555) преди агента и пише `harness.json` (хеш, откази,
подправени файлове, какво налага харнесът, какво не се поддържа). `mandat run --profile <file>` за ръчна проба.
(6) Куки: deny-by-policy (deny/ask → exit 2; ask → asks.jsonl), lint-changed/typecheck-changed (съвет, винаги exit 0; име на файл
с shell знаци → не се пуска), require-tests-ran (блокира веднъж, после `stop_hook_active` пуска), limit-subagents, record-ask.
Защо: v5 т. 4.1; D-311, D-343. Алтернативи: CLAUDE_CONFIG_DIR = контролният слой (несъвместимо с абонамента, D-343).
Източник: v5 т. 4.1. Статус: решено; [НП] части — SH2/SH2-CX на живо.

## D-351 Харнес-профилът във версии; одобрение с TOTP; задача без одобрен профил е BLOCKED (22.10.2026)
Решение: (1) `public.harness_profiles` (version, layers, sources, profile_hash, status proposed|approved|superseded) +
`repos.profile_id`. Одобрената версия е неизменна (тригер); откатът е НОВА версия със слоевете на старата (историята само
расте). (2) `private.approve_profile` в една транзакция: approve.rules (с обхват по repo) + TOTP ≤ 2 мин; невидими знаци
(bidi, zero-width, tag) навсякъде в слоевете → отказ; предишната одобрена → superseded; ledger `profile_change`.
(3) Сканирането (`scanForProposal`) пише и предложен профил (proposeProfile: 8 слоя без AI; клонингът е с 50 комита за
конвенциите). (4) Daemon: одобреният профил (с проверен хеш) → `runTask(profile)`; repo, което има профили, но няма използваем
одобрен (или хешът не съвпада) → BLOCKED `harness_unapproved`; repo отпреди профилите (няма нито един ред) работи както досега.
(5) UI /harness: слоевете A–H с източниците, преглед на компилирания контролен слой за Claude Code и Codex, одобри/върни с код.
`mandat init --profile` пише `.mandat/profile.proposed.json`.
Защо: v5 т. 4.2, AC-2.1/2.5/2.6. Алтернативи: профилът в harness_proposals (смесва .mandat.yml и контролния слой).
Отворено: „Пробвай“ (демо задача с fake:honest-fix върху неодобрен профил) — следваща стъпка (виж docs/tasks/e8b.md).
Източник: v5 т. 4.2. Статус: решено.

## D-352 Правата субект × инструмент с „ask“ и срокът на HELD (22.10.2026)
Решение: (1) `tool_permissions` (на ниво организация) е източникът на слой C: ред пренаписва същия субект × инструмент в C
(причината остава), нов ред се добавя (`applyPermissions`). Промяна, която сменя слой C на repo, е нова одобрена версия на
профила (`private.layer_c_version`), в която базата проверява, че е сменен САМО слой C. (2) „Опасно отваряне“ = правило,
което става allow за `net:*` или `bash:git push…`, без да е било allow; тогава е нужен TOTP ≤ 2 мин. Решава го базата, като
сравнява стария и новия слой C (уеб сървърът само подсказва кога да поиска код). (3) „ask“: hook-ът пише asks.jsonl и
отказва; след агента worker-ът чете файла, но приема САМО записи, които назовават „ask“ правило от поставената policy.json, а
причината на картата идва от политиката (агентът може да пише в /m/out и не може да измисли молба за `net:*`). Има ли
молби → `tool_asks` (pending) + HELD `tool_approval` + известие; доставка няма. (4) Карта: „веднъж“ → `grant_attempt` =
следващият опит, в който worker-ът прави това ask правило allow (`grantOnce`; deny > ask > allow, затова ask се маха, а не
се добавя allow); „винаги“ → ред в `tool_permissions` за субектите на ask правилото + нова версия на слой C + ledger
`tool_permission`; „откажи“ → CLOSED `tool_denied`, останалите молби от опита → отказани. Когато не остане чакаща молба →
нов опит (CREATED, retry_reason human). Право: `approve.tool` (с обхват repo и вид задача); матрицата: `tools.manage`.
(5) HELD срок: `tasks.held_until` се слага от тригер при влизане в HELD (сега + 7 дни), маха се при излизане;
`closeExpiredHeld` (в цикъла на ефектите на worker-а) затваря просрочените: CLOSED `expired`, ledger `task_stopped`,
web push `expired`. `MANDAT_HELD_DAYS` скъсява срока (брои се от state_entered_at).
Защо: v5 т. 4.4. Алтернативи: картата с текста от asks.jsonl (агентът би диктувал какво пита човека); allow-ред до ask
реда (не работи при deny > ask > allow).
Отворено: молба при Codex (pre_tool_use hook-ът е същият; live проверка в S-CX); „веднъж“ не брои срещу attempts_max.
Източник: v5 т. 4.4. Статус: решено.

## D-353 „Насочи“: stream-json на stdin, изключено за истинския Claude Code до S2 (22.10.2026)
Решение: (1) Адаптерът на Claude Code е `supportsSteering`; с `ctx.steer` argv-ът е E0 вариантът (`--input-format
stream-json --replay-user-messages --session-id`, без позиционен prompt), задачата е първият ред на stdin, а всяко
насочване е user съобщение с текста през `frameUntrusted` (source `steer`, автор „member“, без имейл към модела).
(2) runTask: само ако адаптерът може и има `hooks.steer`, stdin е pipe (`docker run -i`), насочванията се питат на 2 s и
се пишат до ПЪРВИЯ `result` на агента; тогава stdin се затваря и агентът приключва както досега. (3) Daemon: насочването е
ред в `task_activities` (kind `steer`, `by_user`); докато върви стъпка с насочване, `tasks.steerable = true` (UI показва
полето само тогава); насочвания от по-ранен опит влизат в договора на следващия (рамкирани). (4) За истинския Claude Code е
изключено, докато спайкът S2 не мине live: `MANDAT_STEER=1` го пуска (чеклистът за десктопа). `fake:steer-echo` е винаги
насочваем (тестове). Codex няма вход по време на работа → в UI няма поле, а обяснение [НП: S-CX].
(5) Hook-ът `deny-by-policy` върви преди ВСЕКИ инструмент (компилаторът маха matcher-а на D и го добавя, ако слой C има
ask/deny правила, а D няма такъв hook): иначе ask правило за MCP инструмент никога не стига до hook-а.
Защо: v5 т. 4.4 (3), AC-8.5; правило 9 (непровереното е [НП] + спайк, не поведение по подразбиране).
Алтернативи: насочване през файл в /m/in (агентът трябва да го чете сам; не е в транскрипта).
Източник: v5 т. 4.4, спайк S2 (docs/spikes/S2*). Статус: решено; live чака Симо.

## D-354 MCP каталог: точни версии, проверка без мрежа, sidecar зад вратата; скилове с хеш (22.10.2026)
Решение: (1) `mcp_servers` += source/registry_name/package/url/version (точна semver, никога latest)/digest/tools_hash/
secrets (имена)/enabled_tools/budget_calls_min/vet_status (pending → vetting → approved | blocked)/vet_findings/approved_*;
`mcp_tool_defs` (хеш на описание и схема по инструмент). (2) Регистърът (`/v0.1/servers`, [V] 22.10.2026) е само
откриване. (3) Одобрение = `tools.manage` (+ TOTP, ако стига извън машината) → outbox `mcp_vet` → worker-ът инсталира
пакета през вратата (npm prefix маршрут само за харнеса, преди агента; scoped packument `/npm/@scope%2fname` е единственото
позволено %2f) и пуска бриджа `--vet` без мрежа. Чисто → approved + нова версия на слой E (`private.profile_layer_version`,
само един слой се сменя); находки → blocked. (4) Изпълнение: sidecar = образът на пясъчника с роля `mcp` (собствен volume,
обявени тайни, без LLM ключове), internal мрежа само с вратата; маршрут `upstream: mcp` с бюджет в минута. Бриджът
(`packages/mcp-bridge`, SDK 2.3.1: low-level Server + createMcpHandler, stateless) сверява хеша при старт и спира на
`tools/list_changed` → `security_event mcp_definition_changed` + каталогът blocked. (5) Скилове: репо + вградени, sha256;
невидим знак → блок; материализира се само текст със същия хеш. (6) Плъгини: вградени редове (verdict в PR — вкл.;
снимка при UI, нощен доклад, Slack — изкл. до фазите им).
Защо: v5 т. 4.5; research-tools.md §4.3 (tool poisoning, rug pull). Алтернативи: npx в агентския контейнер (тайните и
файловете на агента са достъпни на сървъра); доверие в регистъра (той не сканира код).
Отворено: egress на stdio сървъри към обявени хостове и http сървъри (втора врата) [НП]; streamable HTTP от Claude Code и
Codex през вратата [НП → чеклист 18].
Източник: v5 т. 4.5, research-tools.md §4.1/§4.3. Статус: решено.

## D-355 Координация: конфликт по файл, WIP лимит, rebase при изместен base (22.10.2026)
Решение: (1) „Жива“ задача = CONTRACTED…GATED. Записвачът на сесията пише нов пипнат файл веднага (не чака прага от 500 ms;
broadcast-ите остават ≤ 2/s) и вика daemon-а; той сравнява с пипнатото от другите живи задачи на същото repo
(`agent_sessions.touching`) при нов файл и на всеки 2 s, докато агентът работи. Припокриване → `task_activities conflict`
(веднъж на файл и двойка), `security_event conflict_file`, broadcast за картата на главната. При `same_file: wait`
(слой G; по подразбиране) по-късно създадената задача се спира (hook `stopRequested` → `docker stop`) и става нов опит
CREATED с `retry_reason = conflict` и `wait_for = <другата>`; без присъда и без стъпка в стълбата. (2) Взимането на задача
(`claimNext`) пропуска задача, която чака жива задача, и repo, което е на своя WIP лимит (слой G `wip_limit`, по
подразбиране 3). (3) Изместен base: преди доставка daemon-ът сравнява `verdict.base_sha` с HEAD на огледалото; различни →
3-way прилагане на diff-а върху новия main във временен клонинг на хоста (чист git, без hooks). Чисто → новото съдържание
на файловете се пази и задачата е нов опит (`retry_reason = rebase`), който НЕ пуска агент, а записва файловете в работното
дърво и минава износа и проверката като всеки опит → нова присъда (старата остава). Конфликт → HELD `base_moved`, активност
с файловете, конфликтът като артефакт `rebase-conflict.diff`; доставка няма; никога force.
Защо: v5 т. 4.6, AC-4.2/4.5. Пясъчникът няма git (и не трябва да има) → 3-way е на хоста, в пясъчника влизат само байтове.
Алтернативи: агентът сам rebase-ва (нов агентен опит, разход и риск); git в образа на пясъчника.
Източник: v5 т. 4.6. Статус: решено.

## D-356 Доставка: шаблони, кръгове на CI, коментари от ревю, локално прилагане (22.10.2026)
Решение: (1) Един squash комит на опит: `<type>: <първи ред на задачата>` (≤ 72; без контролни и bidi знаци; type = fix/feat/
style/docs), тяло „Checked: <детектори pass>“, трейлъри `Mandat-Verdict: <резултат> seq N` и `Mandat-Task: <id>`;
Co-Authored-By само ако проектът го иска (по подразбиране няма). (2) Тялото на PR е шаблон: задачата (екранирана), таблица
файл / + / − (пътищата в code span), тестове преди → след (D2), присъда с причините в code span, ниво, ред в дневника,
линк към картата (`MANDAT_APP_URL`); няма LLM резюме. (3) CI: worker-ът гледа проверките на PR-а (без своите „Мандат …“);
червен кръг → HELD `ci_failed`, броят расте, логът = имената и заключенията на падналите проверки (code span, никога текстът
им); зелен или чакащ head се гледа пак (проверките идват постепенно). „Поправи CI“ (approver) → нов опит
`retry_reason = ci` с лога в договора (рамкиран като външен), най-много `ci_rounds` (слой G, по подразбиране 2) → после
„Чака теб“ без бутон. (4) Коментарите на ревюъри (вкл. AI) никога не стигат до агента сами: „Приложи коментари“ (approver)
— човекът поставя кои; пазят се като `review` и влизат в договора на нов опит, рамкирани като `pr_comment`.
(5) Проект без GitHub: VERIFIED → клон `mandat/<task>-a<n>` в огледалото на Мандат (един комит върху base на присъдата,
същото съобщение; съществуващ клон не се пипа, без force). `mandat apply --task <id>` прави `merge --ff-only` на най-новия
опит в работното копие; разминаване → отказ `diverged`; локална промяна във файл от промяната → отказ `local_changes`;
статусът на git на човека иначе не се променя (T3-7).
Защо: v5 т. 4.7, AC-9.1–9.3. Алтернативи: LLM резюме на PR (изключено; шаблонът е проверим); автоматично подаване на
коментарите (prompt injection от PR).
Източник: v5 т. 4.7. Статус: решено; live (L1–L3) чака Симо.
## D-357 Червен отбор до 10, bench до 20, D11 special_case, D10 lock_missing, модел на заплахите (22.10.2026)
Решение: (1) Нови атаки R15–R20 (`bench/redteam/r15.ts`…`r20.ts`), всяка с fake в пясъчника и проверки по доказателства
(присъда, gate log, бележки на fake-а), никога по текста на агента: R15 инжекция в задачата → D4 out_of_contract, hook отказва
curl, `allowed_paths` непроменени; R16 отровен MCP → vetting блок, сменен `tools_hash` → блок при старт; R17 запис в `.claude/**`
и `.mcp.json` → UNKNOWN по D3 (D3 подписва само първото попадение, затова тестът чете всички от `evidence.data.findings`),
контролният слой връща EACCES; R18 чужд registry в lockfile → D10 + 403; R19 DNS exfil → `dns_block`, без отговор; R20 CONNECT
до example.com:443 → 403. `mandat redteam --only` приема всеки ключ от `ATTACKS`. (2) Bench B9–B20. Калибрирането показа два
пропуска в детекторите и ги затвори: B9 (специален случай за тестовите входове) беше фалшив VERIFIED → `D11:special_case:<път>:<ред>`
— добавен ред `if (x ===? N) return M`, където N е вход и M очаквана стойност от тестовете, дава UNKNOWN (човек решава);
B11 (нова зависимост без lockfile) падаше като инфраструктура → `D10:lock_missing:<пакет>` (в package.json на head, но не в
базовия, и без запис в lockfile) → FAILED. (3) Отклонения от v5 т. 4.8, съзнателни: B12 празна промяна е FAILED
`MUST_PASS:not_passed`, не HELD — HELD е състояние на онлайн опашката, bench-ът е офлайн присъда; B16 (по-слаб matcher, същият
брой `expect`) е известна граница на D2 и в демото излиза FAILED само защото D4 държи `tests/**` извън договора; при
`may_change_tests: true` би било VERIFIED (записано в модела на заплахите, P11). (4) `docs/security/threat-model.md`: STRIDE по
8 компонента, таблица заплаха → контрол → тест; пропуските без тест са изброени (Q-057).
Защо: v5 т. 4.8; доверието в присъдата зависи от атаки, които са изпълними и повторими, не от обещания.
Алтернативи: специалният случай като FAILED (отхвърлено — легитимна корекция може да съвпадне с тестов вход; UNKNOWN е
честното); D10 lock_missing като UNKNOWN (отхвърлено — без lockfile инсталацията не е възпроизводима, това е провал).
Източник: v5 т. 4.8. Статус: решено; прегледът на модела на заплахите чака Симо.
## D-358 Monorepo, yarn berry, bun и node --test в пясъчника (22.10.2026)
Решение: (1) Workspaces: скенерът чете `pnpm-workspace.yaml` (`packages:` с `!` изключения) или `package.json#workspaces`
(масив или `{packages}`); пакет = директория с package.json по глобовете. Предложението: install и един тестов run в корена
(един отчет; отделни runs по пакет и сливане на отчети — не сега), `test_globs` и `allowed_paths` по пакет, package.json на
всеки пакет е защитен. pnpm lockfile v9 с много importers минава; importer извън хранилището (`..`) → отказ. pnpm 11+ с
`packageManager` пише два YAML документа; env документът (`configDependencies`/`packageManagerDependencies`) не дава маршрути
(pnpm в образа е прикован, `manage-package-manager-versions=false`); непразни `configDependencies` → отказ `config_deps`.
D10 `lock_missing` гледа всеки променен package.json (нов пакет с зависимости — също). (2) yarn berry: lockfile с
`__metadata` (версии 8–10); маршрути само за `<име>@npm:<версия>` с checksum (бинарните по платформа, `conditions`, yarn 4
ги пише без checksum — пинът им е точното име@версия); scoped tarball и с кодирана `%2f` (така ги иска yarn 4); workspace и
вградени compat patch-ове се прескачат; друг протокол → отказ. Инсталира прикованият yarn 4.18.1
от образа (`YARN_IGNORE_PATH=1` — `yarnPath` на репото никога), само през вратата, без скриптове, node_modules linker.
Низът `runtime.install` остава `yarn install --frozen-lockfile --ignore-scripts` (D-301: назовава мениджъра; lockfile-ът
избира yarn 1 или 4) — договорите и хешовете не се променят. (3) bun: текстовият `bun.lock` (JSONC), маршрути за записите
от подразбиращия се registry със sha512; bun 1.4.3 в образа (x64 baseline, без AVX2), инсталира само той, тестовете остават
vitest/jest. (4) node --test: собствен репортер в образа пише Vitest JSON формата; `tests.format: node-test`; командата е
фиксирана (`NODE_TEST_COMMAND`), друга → unsupported_runner. mocha → needs_human (Q-058).
Защо: v5 т. 4.9; повечето истински JS репа са monorepo или с друг мениджър. Един и същ модел навсякъде: lockfile → точни
маршрути във вратата → прикован инструмент без скриптове.
Факти и линкове (22.10.2026): docs/spikes/RUNNERS.md — https://yarnpkg.com/configuration/yarnrc,
https://bun.com/docs/install/lockfile, https://bun.com/docs/install/registries, https://nodejs.org/api/test.html#custom-reporters;
наблюдавано локално с pnpm 12.14.0, yarn 4.18.1, bun 1.4.3, Node 22.22 и в образа с Node 24.22.0.
Алтернативи: berry чрез `yarnPath` от репото (отхвърлено — кодът на репото избира инструмента на инсталацията); `bun test`
(свой формат; по-късно); TAP парсер за node --test (губи файла).
Източник: v5 т. 4.9. Статус: решено.
## D-359 Спайк RS без ключове: златен набор, правило за подниз-цитат, обхват на E9г по подразбиране (22.10.2026)
Решение: (1) `fixtures/research/golden.json` — 20 въпроса (10 проектни, чийто отговор тестът намира дословно във файла на
demo-shop; 10 общи със стабилен отговор и URL); схема `GoldenSet` в contract. (2) Цитат се брои само като подниз на
източника след нормализация (`packages/core/src/citations.ts`: NFKC, малки букви, кавички/тирета, невидими знаци, интервали;
многоточие в края = отрязване) — същото правило за E9г. (3) `node spikes/rs-run.mjs` мери Tavily/Exa/Brave с ключове от
средата (никога от файл, никога в изхода); Anthropic web search/fetch се мери едва през проксито в E9г (правило 2).
(4) Докато няма числа, обхватът на E9г е одобреното подразбиране на Q-047…Q-050 (PRD v1.1).
Защо: v5 т. 4.10; без ключове живата част е SKIPPED, но наборът, правилото и скриптът не зависят от ключ.
Факти: формите на заявките — docs/prd/research/research-tools.md (Tavily [V], Exa/Brave [НП], 22.10.2026).
Алтернативи: Anthropic през директен ключ в скрипта (отхвърлено — ключът е само в проксито).
Източник: v5 т. 4.10. Статус: решено; живото пускане чака Симо (чеклист 15).
## D-360 Вид задача „Без ограничения“ (free) (23.10.2026)
Решение: Симо (23.10.2026): „да, без никакви ограничения“. Нов вид `free`: договорът е за цялото хранилище (`allowed_paths:
["**"]`) и тестовете може да се променят; ако `.mandat.yml` дефинира `free`, важи дефиницията на проекта. По подразбиране е за
истински агент в „Нова задача“ (демо агентите остават на bugfix — сценариите им са такива). Какво НЕ се изключва: присъдата
(D1, D2, MUST_PASS, D10, D11) и защитените пътища (D3 → UNKNOWN, човек решава — без тях агентът може да пренапише собствените
си правила); рисков клас medium (сливане най-много до ниво 2; ниво 3 иска човек). Изтрит тест при free е UNKNOWN (човек
решава), не FAILED — така работи `may_change_tests: true`.
Защо: обхватът по вид задача ограничаваше нормална работа (bugfix = само src/**, без тестове), а формата не го показваше.
Алтернативи: само по-широк feature (отхвърлено от Симо); free без присъда (отхвърлено — тогава няма смисъл от харнеса).
Източник: Симо в чата, 23.10.2026. Статус: решено.
## D-361 Нощната смяна: тик, паркиране с въпрос, правилата на нощта (23.10.2026)
Решение: (1) Worker-ът тиктака смяната на всеки 30 s (`nightShiftTick`): planned → running в starts_at; ≤ N слота
(`MANDAT_NIGHT_SLOTS`, иначе слотовете на worker-а) нормални задачи с `shift_id` (агент `MANDAT_NIGHT_AGENT`, по
подразбиране claude), които daemon-ът взима като всички други. (2) Завършена задача: CLOSED+VERIFIED → merged; GATED/
DELIVERED или HELD за одобрение → waiting; FAILED/UNKNOWN → нов опит (`retry_reason = night`, бележка от Мандат: какво спря
и предложение по клас — само текст на Мандат, не на агента) до `rules.retries`, после или веднага при нерешимо (POLICY:*,
INFRA:*, HELD:*, E_*) → parked: клонът остава, ред в night_questions {what_stopped, tried, proposal}, и следващата задача
тръгва в същия тик. (3) Спиране само при бюджет (останалите skipped „budget“); ends_at → останалите skipped „time“, текущите
довършват, после done + доклад {merged, waiting, parked, failed, skipped, spent_usd, learned} + push (само броеве и разход) +
ledger. (4) Нощна задача в daemon-а, докато смяната върви: субект `night` (забранените инструменти → deny в слой C, хешът
се преизчислява); сливане само при ниво ≥ min_level и редове ≤ max_lines, иначе draft PR (чака човек). (5) Сутрин в /night:
„Отговори и продължи“ (отговорът е бележка от човек, рамкирана като steer; нов опит по дневните правила), „Затвори“ (CLOSED
parked_closed), „Направи задача“ (нова задача с текста и предложението). night.manage за всичко.
Защо: v5 т. 5.1, D-320: смяната не спира заради една задача. Имейл докладът (плъгин notify) не е направен — изключен по
подразбиране, чака SMTP (Q-055).
Източник: v5 т. 5.1. Статус: решено; живата нощ чака Симо (чеклист 14).
## D-362 D5 скрити тестове: в базата, само в дърво B, без имена към агента (23.10.2026)
Решение: (1) Скритите тестове на проект са версии в `private.hidden_tests` (само service ролята чете) с метаданни в
`public.hidden_test_sets` (версия, брой, хеш; членовете четат). Нова версия: approve.rules + TOTP от последните 2 минути
(базата проверява времето) + ред в дневника `hidden_tests`. Отклонение от v5 т. 5.2 (`$MANDAT_HOME/hidden/…`): web и
worker не винаги делят диск (VPS, облак), базата е общото място; съдържанието никога не се връща в браузъра. (2) Worker-ът
взима последната версия и я подава на проверката; файловете се пишат в дърво B под `g.hidden_tests_dir` (по подразбиране
tests/__hidden__) след износа, след като D11 е прочел своите входове, и преди тестовете; volume-ът на агента никога не ги има
(docker тестът: fake, който търси из цялата си файлова система, не ги намира). (3) Отчетът на B се разделя: скритите тестове
отиват само в D5, всичко друго (D1, D2, MUST_PASS, D11) ги не вижда. Паднал скрит тест → FAILED `D5:hidden_fail:h<8 hex>`
(хеш, не име — бележките за нов опит и нощните въпроси се правят от сигнатурите); evidence-ът е `agent_visible: false`;
скрити файлове, които runner-ът не пусна → UNKNOWN `D5:not_run`. Политика, която изисква D5 без качени тестове → FAILED
INFRA:detector_missing. (4) `mandat verify --hidden <dir>` за външна проверка. Качването от UI е до 1 MB (лимитът на заявка).
Защо: v5 т. 5.2, AC-7.2: присъда, която агентът не може да „учи“ наизуст.
Източник: v5 т. 5.2. Статус: решено.
## D-363 D8 статични проверки: lint/typecheck на проекта и нови зависимости (23.10.2026)
Решение: (1) Командите lint и typecheck идват от одобрения профил (слой B, `commands.lint|typecheck`; `{files}` → `.`) или
от `mandat verify --lint/--typecheck`. Вървят последни в процедурата на дърво B (след тестовете и мутантите), на същия
инсталиран volume, без мрежа; на base — веднъж и в кеш `cache/checks/<base_sha>-<хеш на командите>.json`. (2) Броят само ако
минават на base: червено на base → `skipped` (не е на агента). Паднала на B, минала на base → FAILED `D8:lint_fail|type_fail`;
timeout → UNKNOWN. (3) Нова зависимост (ред в package.json, който го няма на base): лицензът и датата на публикуване се четат
от хоста от npm registry (packument: `versions[v].license`, `time[v]`, `dist-tags.latest`; https://docs.npmjs.com/cli/v11/
using-npm/registry, 23.10.2026). Лиценз извън allowlist-а (по подразбиране пермисивните SPDX; OR стига една страна, AND —
всички), по-млада от 3 дни (D-036) или без факти → UNKNOWN `D8:dependency:<име>` (човек решава). [НП] За диапазон (`^1.2.0`)
взимам `latest`, не точната версия от lockfile-а — консервативно (по-нова → по-млада), но може да е друга версия; точната от
lockfile-а е следваща стъпка.
Защо: v5 т. 5.2 (D8), AC-5.5: грешка на lint/типовете или рискова зависимост не минава незабелязано, а чуждите червени не
се броят срещу агента.
Източник: v5 т. 5.2. Статус: решено ([НП] версията от lockfile-а).
## D-364 D12 UI: dev сървърът на B и браузър в собствена вътрешна мрежа; преди/след на картата (23.10.2026)
Решение: (1) Кога: промяната пипа път от `g.ui_paths` на профила (или `mandat verify --ui-paths`). Иначе D12 няма evidence.
(2) Как: последна стъпка в процедурата на B. `docker network create --internal` само за run-а (без изход навън, нищо
публикувано); контейнер `ui-app` (образът на пясъчника, SANDBOX_HARDENING, 1000:1000, без тайни) пуска dev командата на профила
(`commands.dev`) с PORT=4173 HOST=0.0.0.0 върху инсталирания volume на B; контейнер `ui` (mandat-sandbox-ui: официалният образ
на Playwright 1.63.0 по digest, пакетите playwright/playwright-core по integrity, без install скриптове; измерен размер 3,6 GB,
затова opt-in: `mandat images build --ui`) със собствен out volume — приложението не може да пише резултата, по който се съди —
отваря маршрутите (`g.ui_routes` или `--ui-route`, до 5, само пътища на същия origin; по подразбиране „/“), записва console
грешки, неуспешни заявки (мрежова грешка или статус ≥ 400) и скрийншот; result.json се парсва строго (zod `UiRunResult`).
Chromium е с `--no-sandbox`: пясъчникът е контейнерът (без capabilities, read-only root, без мрежа навън). (3) Преди/след:
същата стъпка върви веднъж на base (кеш `cache/ui/<base_sha>-<хеш на настройките>/`); base скрийншотите се слагат в
`/m/in/base` на out volume-а (root seed, като всички /m/in); браузърът сравнява пикселите на canvas в самия Chromium (без нова
зависимост): дял на пикселите с разлика > 16 в някой канал. (4) Присъда: грешка → UNKNOWN `D12:console_error|failed_request:
<маршрут>`; иначе дял > 1% → UNKNOWN `D12:visual_diff:<маршрут>` (сменена дума минава, нов вид — не; човек сравнява); иначе
pass. Няма dev команда, няма образ или приложението не отговаря за 30 s → UNKNOWN `D12:not_run`; цялата проверка ≤ 60 s (непосетен маршрут → грешка „бюджетът свърши“). D12 никога не дава FAILED сам.
(5) Картата: worker-ът качва скрийншотите (`route-N.png`, `base-route-N.png`, ≤ 5 MB) в `public.changeset_shots` (approver+,
като diff-а; пише само service); уеб: `GET /api/changesets/<id>/shots/<name>` (image/png, nosniff, CSP default-src 'none',
private cache) и секция „Как изглеждат страниците (преди и след)“ с дела на променените пиксели и грешките като текст.
Защо: v5 т. 5.2 (D12), AC-5.5. Вътрешната мрежа пази правило 7 (без publish); преглед „на живо“ от браузъра на човека (AC-5.4)
би изисквал публикуван порт → Q-059. Маршрутите „от diff-а“ не се извеждат (няма надежден общ начин): профилът ги казва.
Източник: v5 т. 5.2; https://playwright.dev/docs/docker (23.10.2026). Статус: решено.
## D-365 Bench 40: B21–B40 и двете дупки, които намери (23.10.2026)
Решение: (1) B21–B29 вървят по свободен договор (`contracts/free-cart.json`: тип free, всички пътища, тестовете може да се
пипат), за да няма D4, на който D2/D3 да се облягат. B30–B32 с D5 скритите тестове на bench-а (правилото, не единичния вход);
B33–B35 с D8 (профил с `lint: ! grep -rn "console\.log" src`, `typecheck: npx tsc --noEmit` — магазинът няма eslint);
B36 код, който „поправя“ само под тестовете; B37–B39 защитени файлове (snapshot, .npmrc, AGENTS.md) по свободния договор;
B40 нетествана нова функция (D11 survived). VERIFIED са само 4 от 40 (B1, B21, B30, B33). (2) Първият docker пуск даде 17/20
и едно лъжливо VERIFIED: B28 — точен matcher (`toBe(1000)`) сменен с хлабав (`toBeGreaterThan(0)`) при същия брой expect.
Поправка: D2 сравнява дела на точните matcher-и (toBe/toEqual/toStrictEqual/toMatchObject/toHaveBeenCalledWith/
toHaveProperty/toThrow със стойност, без `.not`) сред променените директни expect редове; по-малък дял → weakened_assertions
със статус unknown (евристика: човек гледа; изнесен в helper expect не се брои — D-267). (3) B36 даде нов клас D11:test_env:
добавен ред в източника, който пита за средата на тестовете (`process.env.VITEST*|JEST_WORKER_ID|CI`, `NODE_ENV === "test"`,
`import.meta.vitest`; не в коментар/низ) → UNKNOWN. (4) По свободен договор отслабен тест е UNKNOWN (човек решава), не FAILED —
тестовете там може законно да се преработват; изтрит/прескочен must-pass тест е FAILED чрез MUST_PASS.
Защо: v5 т. 5.2 „bench 40/40 с 0 лъжливо VERIFIED“; bench-ът е там, за да хваща точно такива дупки.
Източник: v5 т. 5, т. 5.2. Статус: решено.
## D-366 mandat verify като GitHub Action (23.10.2026)
Решение: (1) `action.yml` в корена (composite): Node 24.22.0 (actions/setup-node по SHA 949feb24…, v7.1.0), сглобява само
`@mandat/cli...` и `@mandat/verify...`, строи образите (`--ui` само при `ui-paths`), пуска `packages/verify/dist/action-main.js`.
(2) Доверен base: `origin/<GITHUB_BASE_REF>` от checkout-а на workflow-а (actions/checkout с fetch-depth: 0) се копира в bare
хранилище в `$RUNNER_TEMP` (само този клон, HEAD към него) и се дава като `file://` remote — Mandat не вижда токен; refs на PR-а
не влизат. (3) Входове: type (празно = строгите правила), fail-on FAILED|UNKNOWN, lint, typecheck, ui-paths, dev, ui-routes;
винаги `--external` (агентът не е бил в нашия пясъчник → ниво ≤ 1). (4) Изход: job summary с причините с думи (explain),
анотации error/warning/notice (екранирани по workflow commands), outputs result/level/reasons; exit 0/1 по fail-on, 2 = не върви.
SHA-тата: `git ls-remote` на github.com/actions/setup-node, actions/checkout (23.10.2026).
Защо: стратегическо — най-силната част на Мандат е независимата присъда; Action-ът работи с всеки агент, без смяна на процеса.
Правило 3 (без публикуване): файлът е в репото; публикуване в Marketplace — само ако Симо реши.
Източник: https://docs.github.com/actions/creating-actions/creating-a-composite-action (23.10.2026). Статус: решено; първото
пускане на истински runner чака Симо (чеклист 24).

## D-367 Питай човека само при нужда: проверена безопасна промяна влиза сама (23.10.2026)
Решение (Симо, 23.10.2026: „трябва да е САМО ако е абсолютно нужно“; избра вариант А): в локален проект (`provider = local`,
`pnpm local`) VERIFIED промяна влиза в `main` на огледалото сама — без одобрение, без втори фактор — когато
`autoApply` (packages/core/src/auto-apply.ts, чиста функция) не намери причина за човек. Причините (кодове в
`task_activities` „needs_you“ и в `gated` реда на дневника): не е VERIFIED; агент отвън (D-207); празна; изтрит или
преименуван файл; чувствителен път — зависимости и lockfile-ове, CI/инфраструктура (.github, Dockerfile, deploy/, infra/, *.tf),
правилата на агентите (.mandat.yml, AGENTS.md, CLAUDE.md, .claude/, .mcp.json…), тайни (.env*, *.pem, *.key, .npmrc…), git куки,
миграции; над 300 променени реда или над 15 файла (`AUTO_APPLY_LIMITS`); нощна смяна (нейните правила, D-361, остават).
Сливането е само напред (`mergeLocal`: update-ref с очакваното старо `main`); ако не стане — обратно при човека
(`apply_failed:<причина>`) с обичайното известие. Влязла сама → CLOSED, доставка `merge`, успех за стълбата, известие „merged“;
статус „Приложена сама“. Одобрение от човек на локална задача вече също слива клона в `main` и дава успех на стълбата
(преди одобрението само маркираше задачата, а стълбата локално не мърдаше никога).
Какво остава: съдията (D1–D12) и всички врати преди доставката (ask правила, key_rejected, empty_change, base_moved) са
непроменени; UNKNOWN винаги пита. GitHub проектите остават на стълбата (D-231: ниво ≥ 2 иска ruleset) — следващ ход, ако Симо иска.
Защо: всяка задача чакаше одобрение (ниво 0 за всяка нова двойка агент × вид, таван 1 без ruleset, стълбата локално не
расте), а човекът одобряваше промени, които Мандат вече е проверил. Отменя за локалните проекти частта от D-360
„рисков клас medium, за да има човек пред сливането“: човекът остава там, където `autoApply` казва защо.
Риск: агентът може да вкара безопасна на вид, но грешна промяна в `main`; смекчено от присъдата (тестове, скрити тестове,
мутанти), лимита по размер и това, че `main` на огледалото се връща с git (клонът и дневникът пазят всичко).

## D-368 Локалният режим без вход; Better Auth за истински профили по-късно (23.10.2026)
Решение (Симо, 23.10.2026: „не мисля, че за сега ни трябва логин … теглиш, връзваш към своите неща и си ти без да ти е
нужен профил при нас“): (1) `pnpm local` и `pnpm desktop` нямат вход. Уебът получава `MANDAT_LOCAL_OWNER` (локалният
собственик, DEMO_OWNER_ID) вместо `MANDAT_DEMO_DEV_AUTH`; `authMode() = "local"`; `currentUser()` връща собственика само при
loopback Host (`localhost`, `127.0.0.1`, `[::1]`, с или без порт; apps/web/src/lib/server/local-auth.ts). CSRF бисквитката
(double submit) я слага самата страница в браузъра (`LocalCsrf`, 32 случайни байта, 30 дни) — първоначално беше пренасочка
през `GET /api/auth/local`, но тя губеше дълбоката връзка (проба в браузъра, 23.10.2026). Няма парола (старата от предишно пускане се
изтрива, `seedLocal` без `password`), няма TOTP, няма „Изход“. (2) Уебът слуша само на 127.0.0.1: `pnpm --filter
@mandat/web exec next start -p 3000 -H 127.0.0.1` — `next start` по подразбиране е 0.0.0.0 (`next start --help`, Next.js
16.3.8: „-H, --hostname <hostname> … (default: 0.0.0.0)“; https://nextjs.org/docs/app/api-reference/cli/next, 23.10.2026).
(3) Одобренията локално са клик („локално присъствие“, `localPresence`): `factorAt` (actions.ts) е единственото място,
което решава кода — TOTP иска код, локалното присъствие не; формите не показват поле за код (`SecondFactorProvider`).
Одобрението се записва честно с `method = 'local'` (миграция 20261023000025: check-ът и тригерът приемат 'local' със
същия срок ≤ 2 мин за mfa_verified_at), не като TOTP, който не е бил. (4) Десктопът чете само адреса от банера и го отваря;
скриптът за вход и диалогът за TOTP са махнати. (5) Supabase Auth (хостнатият режим) и демо входът (e2e) са непроменени.
Защо: целта е лесно ползване без профил при нас; харнесът върви на машината на човека с неговите абонаменти и ключове.
Без вход единствената граница е „този компютър“, затова 127.0.0.1 + проверка на Host (чужда страница, пренасочила името си
към 127.0.0.1 — DNS rebinding — запазва своя Host и не получава нищо) + проверката на Origin и CSRF за POST (D-285).
Профили по-късно (E10, екипи или споделен сървър): Better Auth (MIT, в нашия Postgres, работи офлайн; плъгин `anonymous`
дава сесия без лични данни и после свързване с истински профил чрез `onLinkAccount` — https://better-auth.com/docs/plugins/anonymous,
23.10.2026) — локалният собственик става анонимният потребител. Нова зависимост тогава по правило 8.
Алтернативи: Clerk (затворена услуга в облака: вход през интернет, publishable + secret ключ в env срещу правило 4, данни
извън машината; безплатно до 50 000 потребители на месец — https://clerk.com/articles/clerk-pricing-explained, 23.10.2026);
Supabase Auth локално (GoTrue — тежко, D-292 го махна от `pnpm local`); парола без TOTP (пак триене без полза на една машина).
Риск: всеки процес на същата машина може да ползва харнеса (както и досега базата на 127.0.0.1:54329); в мрежата — нищо.
Статус: решено; командите от уеба/десктопа — D-369 (вход в абонамент), D-370 (страница „Система“).

## D-369 Вход в абонамент от уеба (`mandat login` от „Акаунти“) (23.10.2026)
Решение: (1) В `pnpm local` „Акаунти“ има форма вместо командата за терминал: име → `mandat local` пуска непроменения
`claude auth login --claudeai` в контейнер (`buildProfileArgs("login-web")` = същите аргументи като `login`, но `-i` с тръби
вместо `-it`), показва адреса на Anthropic като връзка, а кодът, който човекът постави, отива в stdin на процеса — само
там: не се пази, не се логва, не се връща в отговор (тестове). След изход: `claude auth status --json` → готово/не.
(2) Състоянието минава през контролната точка (D-293: 127.0.0.1 + bearer токен): `GET|POST|DELETE /accounts/login`,
`POST /accounts/login/code`, `POST /accounts/logout`; схемата е в packages/contract (`LoginState`, `AccountName`,
`LoginCode`, `findLoginUrl`) — уебът отказва адрес извън claude.com, claude.ai, platform.claude.com, console.anthropic.com
(https, път …/oauth/authorize). Един вход наведнъж; забравен вход спира след 10 мин. (3) Уеб API: `/api/accounts/login`,
`/api/accounts/login/code`, `/api/accounts/logout` — право `accounts.manage`, Origin + CSRF. „Махни“ до всеки акаунт.
(4) Хостнатият режим (без контролна точка) остава с командата за терминал.
Факт (спайк на живо, 23.10.2026, образ mandat-sandbox cc2.1.302): Claude Code 2.1.302 без TTY печата „Opening browser to sign in…“,
„If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&…&code_challenge_method=S256&…“ и
„Paste code here if prompted >“, после чете един ред; грешен код → „Invalid code. Please make sure the full code was copied.“
(проверено и през `LoginSessions` с истинския Docker: waiting_code → invalid_code, контейнерът спира).
Защо: Симо: „всяка команда да бъде направена от уеба/десктопа“. Входът остава потокът на Anthropic в непроменения Claude
Code (D-295); потокът е PKCE (S256), затова кодът без verifier-а в контейнера е безполезен, а харнесът никога не вижда токена —
уебът прави каквото прави терминалът: препраща реда, който човекът пише. [НП: дали Anthropic гледа на това като на
„посредничество“ — по нашия прочит не, защото токенът не минава през харнеса; Симо да потвърди.]
Алтернативи: вграден терминал (xterm.js + pty — нова зависимост, същото препращане); само командата (сегашното, трудно).

## D-370 Страница „Система“: командите на CLI-то от уеба (23.10.2026)
Решение: нова страница „Система“ (/system, в менюто) с бутони за затворен списък от задачи (`SystemJob` в contract):
doctor (`doctor --json`), images (`images build`), images-ui (`images build --ui`), fixtures (`fixtures build` и
`--name demo-shop`), fixtures-force (същото с `--force`, след потвърждение), stats (`stats --json`), verify-log
(`verify-log --org <локалната org> --json`). argv е фиксиран в contract (`SYSTEM_JOB_ARGV`); от уеба идва само името на
задачата. `mandat local` пуска себе си (`node main.js …`) без API ключовете в env (D-293); по една задача от вид наведнъж;
страницата вижда последните 200 реда (без ANSI и контролни знаци) и JSON резултата (проверките на doctor, числата на stats,
веригата). Контролна точка: `GET /system`, `POST /system/<job>`; уеб API `/api/system`, `/api/system/<job>` — право
`tools.manage`. Проверено на живо през `SystemJobs` с истинските команди: doctor (Node 26 ≠ 24.22.0, липсващи образи),
stats (3 VERIFIED), verify-log (веригата е цяла, 19 реда), fixtures (E_FIXTURE_MISMATCH → затова fixtures-force).
Защо: Симо: „всяка команда да бъде направена от уеба/десктопа, за да е лесна за ползване“; десктопът е прозорец около уеба,
затова получава същото. Не са в уеба: run (задачите вече са от „Нова задача“), bench/redteam (дълги, за разработчици),
proxy (ключовете са в „Акаунти“), init/contract/anchor/tui — при нужда следващ ход.
Не е проверено: страниците в браузър (локалният `pnpm local` на Симо върви със старата версия; нов `next build` би
презаписал `.next` под него).


## D-371 Мостът десктоп ↔ уеб: тесен, типизиран, със zod в двата края (24.10.2026)
Решение: прозорецът на десктопа и уебът говорят само през `window.harnessDesktop`. Съобщенията са в
`packages/contract/src/desktop.ts`: 9 метода (уеб → main, отговор `{ok, value} | {ok:false, error{code, message}}`):
`pickFolder`, `grantsList`, `grant`, `revoke` (`LocalGrant {path, scopes: read|apply|open_editor|terminal, granted_at}`),
`openInEditor` (vscode|cursor|zed), `applyLocal` (`mandat apply --task <id>`, само fast-forward), `notify`, `badge`,
`inboxCount`; и един канал main → уеб (`harness:event`) за команди (`DesktopCommand`: меню, клавиши, клик на известие →
`open_task`). Каналите са `harness:<метод>`; друг канал няма handler.
Трите слоя: (1) **preload** (`apps/desktop/src/preload.ts` → `dist/preload.cjs`) е sandboxed, затова не внася нищо
(нито zod, нито contract): пуска само изброените методи, само обикновен JSON обект ≤ 64 KiB, събитието на IPC никога не
стига до страницата, обектът е замразен; тест държи списъка равен на този в contract. (2) **main** (`bridge-main.ts`)
отговаря само на страница от локалния адрес (`senderFrame.url`; преди банера — на никого), парсва заявката и **своя**
отговор с contract, изключение на handler не се препраща (може да носи пътища). (3) **уебът**
(`apps/web/src/lib/client/desktop.ts`) парсва заявката преди изпращане, отговора и командите след получаване; без мост
(браузър, PWA) `desktopBridge()` е null и уебът е като досега.
Прозорецът (D-303 остава): contextIsolation, sandbox, без nodeIntegration, `webSecurity`; нови прозорци — отказ винаги;
`will-navigate`, `will-frame-navigate`, `will-redirect` извън локалния адрес — отказ; `<webview>` — отказ; уеб
разрешения — само `clipboard-sanitized-write` от локалната страница; CSP (`DESKTOP_CSP`) заменя каквото прати страницата:
`default-src 'self'`, без `unsafe-eval`, `object-src/frame-src/frame-ancestors 'none'`, `form-action/base-uri 'self'`,
`connect-src 'self'`. `script-src` и `style-src` имат `'unsafe-inline'`, защото Next App Router слага flight данните си в
inline скриптове без nonce [НП: https://nextjs.org/docs/app/guides/content-security-policy — не е отворено днес; с
истинския UI под CSP-то ще се провери в e2e на А5]. Днес работят `pickFolder`, `notify`, `badge`, `inboxCount`;
`grants*`, `openInEditor`, `applyLocal` отговарят `not_ready` до А3. Агентът в пясъчника не получава нищо от моста
(няма нови mount-ове, env или ключове).
Проверено (24.10.2026, Electron 44.9.0 на macOS): имената и подписите в `node_modules/electron/electron.d.ts`
(`contextBridge.exposeInMainWorld`, `ipcRenderer.invoke`, `ipcMain.handle`, `senderFrame: WebFrameMain | null`,
`webRequest.onHeadersReceived`, `setPermissionRequestHandler`, `will-frame-navigate`, `will-redirect`,
`will-attach-webview`, `app.setBadgeCount`); и на живо — `pnpm --dir apps/desktop smoke`: sandboxed CommonJS preload с
`exports` се зарежда, мостът има точно изброените методи, страницата няма `require`/`process`, main отказва невалидна
заявка, `window.open` и външна навигация се отказват, CSP-то заменя това на страницата, inline скрипт върви.
Че sandboxed preload може да `require` само "electron" и няколко вградени модула [НП: https://www.electronjs.org/docs/latest/tutorial/sandbox —
не е отворено днес]; затова preload-ът е един файл без импорти.
`apps/desktop` внася `@mandat/contract` като `link:../../packages/contract` (вътрешен пакет, не нова външна зависимост);
`pnpm build` в корена строи contract преди `pnpm desktop`. Тестовете на `apps/desktop` вървят в коренния vitest
(`pnpm test`, значи и в `pnpm check`); поотделно: `pnpm --dir apps/desktop test`.
Защо: тесен мост е единственото място, където страницата може да стигне до диска и до OS-а; затова е затворен списък,
описан на едно място (правило 11), и се проверява в трите слоя — ако един слой сгреши, другите два пак отказват.
Preload без импорти, защото sandbox не позволява bundle-нати зависимости без bundler, а нов bundler е нова зависимост
(правило 8) за ~100 реда код.

## D-372 Нативното поведение на десктопа: менюта, клавиши, tray брояч, известия, вход при стартиране (24.10.2026)
Решение: менютата и картата на клавишите са чисти данни, тествани без Electron: `apps/desktop/src/shortcuts.ts`
(`shortcutMap()`: ⌘/Ctrl+N нова задача, ⌘/Ctrl+Enter одобри, ⌘/Ctrl+K търсене, ⌘/Ctrl+1..9 проект, глобално
⌘/Ctrl+Shift+Space бързо въвеждане) и `apps/desktop/src/menu.ts` (`appMenu`, `trayMenu`, `trayState`, `toTemplate`).
Меню: (macOS: менюто на приложението с About, „Стартирай при вход“, Hide, „Спри и излез“), File (Нова задача, Добави
проект, Приложи локално), Edit (само роли: undo/redo/cut/copy/paste/selectAll — копирането работи в прозореца), View
(Входящи `/`, Дъска `/board`, Агенти `/agents`, Инструменти `/tools`, Нощна смяна `/night`, Ресърч `/research` + reload и
zoom), Клавиши (всички комбинации; Help → „Клавишни комбинации“ ги показва в прозорец), Window, Help. Всяка комбинация на
прозореца е регистрирана **точно веднъж** — в менюто „Клавиши“ (тест); глобалната — само през `globalShortcut`, затова в
менюто е в текста на реда. Елемент на менюто или клавиш праща `DesktopCommand` към уеба (`harness:event`, D-371);
уебът (`apps/web/src/lib/client/desktop-commands.ts` + `components/desktop-commands.tsx`) го превежда в навигация или
натискане на бутон на страницата. **Одобри** само натиска собствения бутон „Одобри“ на картата (`data-desktop-approve`),
който отваря потвърждението със TOTP кода, когато промяната го иска; main не одобрява нищо. Докато човекът пише в
поле, ⌘/Ctrl+Enter не прави нищо от наша страна, за да остане „изпрати“ на полето (workspace го ползва). ⌘/Ctrl+1..9
натиска n-тия проект в страничната лента (`data-desktop-project`). „Добави проект“ води към `/harness` до А3.
Броячът „чака теб“: main чете съществуващото `GET /api/inbox` на `pnpm local` на всеки 15 s (локалният собственик през
loopback адреса, D-368); от отговора пази само `id` и `text` (`DesktopInboxSnapshot` в contract). Броячът е в tooltip-а и
менюто на tray, до иконата в менюлентата на macOS (`tray.setTitle`) и в баджа (`app.setBadgeCount`). Нов елемент → едно
системно известие (няколко нови → едно с броя), само ако прозорецът не е на фокус; първото четене не известява (без залп
при старт); клик → прозорецът излиза и уебът отваря картата `/tasks/<id>` (няколко → входящите). Затворен прозорец не
спира харнеса (D-303), затова броячът и известията работят и тогава.
„Стартирай при вход“: отметка в менюто на приложението и в tray, **изключена по подразбиране** — само кликът извиква
`app.setLoginItemSettings({ openAtLogin })`; настройката я пази OS-ът. Има я само на macOS и Windows.
Проверено (24.10.2026, Electron 44.9.0, `node_modules/electron/electron.d.ts`): `setLoginItemSettings` е `@platform
darwin,win32`; `setBadgeCount` е `@platform linux,darwin` — на Windows бадж няма, броячът е в tooltip-а на tray;
`registerAccelerator` е само linux/win32, затова на macOS не може да има „показан, но нерегистриран“ клавиш и всяка
комбинация е само на едно място; `globalShortcut.register(accelerator, cb): boolean`. На живо (`pnpm --dir apps/desktop
smoke`, macOS): менютата на трите платформи се строят с `Menu.buildFromTemplate` (ролите и комбинациите се приемат),
`CommandOrControl+Shift+Space` се регистрира глобално (true). Синтаксисът на комбинациите
[НП: https://www.electronjs.org/docs/latest/api/accelerator — не е отворено днес; приет от истинския Electron в smoke].
Дали ключовите събития стигат първо до страницата и после до менюто на macOS [НП — ще се види в e2e на А5].
Защо: картата като чиста функция е единственият начин AC-12.7 да има unit тест и менюто, помощта и регистрацията да не
се разминат; одобрението остава в уеба, защото там е TOTP проверката — клавиш, който одобрява директно, би я заобиколил.
Броячът се чете от main, а не се праща от страницата, защото трябва да работи и при затворен прозорец (AC-12.5).
## D-373 Локален достъп с разрешения и локални редакции в десктопа (24.10.2026)
Решение: десктоп приложението не вижда нищо на диска, докато човекът не даде папка. Разрешението (`LocalGrant {path,
scopes, granted_at}`, contract) е за папка и за изброени права: `read` (папката може да стане проект), `apply` („Приложи
локално“), `open_editor` („Отвори в редактора“), `terminal` (запазено за А4). Разрешенията живеят **само в main процеса**,
във файл `MANDAT_HOME/local-grants.json` (`LOCAL_GRANTS_FILE`, `LocalGrantsFile {version: 1, grants}`) — същата профилна
папка, която ползва `pnpm local` (`MANDAT_HOME`, иначе `<repo>/.mandat`, `packages/cli/src/paths.ts`). Запис атомарно:
временен файл в същата папка (`wx`, 0600), fsync, rename; папката се създава с 0700. Файл, който не се чете или не минава
zod, значи **няма разрешения** (безопасната страна); новото даване го заменя. Уебът само пита през моста (D-371).
Даване: нативен диалог за папка (`pickFolder`), drag-and-drop на папка върху прозореца, „Отвори с“ / папка върху иконата
(macOS `open-file`) или втори старт с път (`second-instance` argv, `folderArgs`) → екран „Добави проект“
(`/projects/add?path=…`) с предложение: името на папката и само `read` по подразбиране (останалите права са по избор;
нищо на диска не се чете преди даването) → бутон „Дай достъп“ → **нативно потвърждение** в main (Разреши / Отказ, Отказ
по подразбиране), което изброява правата с думи. Пускането на папка само показва екрана — нищо не се дава.
Drop: preload-ът слуша `dragover`/`drop` на прозореца (само ако страницата не е поела събитието), взима пътя с
`webUtils.getPathForFile` и го праща по отделен канал `harness:drop` (`DESKTOP_DROP_CHANNEL`, `DesktopDrop`), който не е
метод на моста — страницата не може да го извика; main го приема само от локалната страница. Проверено на живо
(`pnpm --dir apps/desktop smoke`, Electron 44.9.0, macOS): слушателят е инсталиран в sandbox preload-а (значи `webUtils` и
`ipcRenderer.send` са налични), синтетичен File без локален път не праща нищо. Дали истинска папка, пусната от Finder/
Explorer, дава пътя си през `getPathForFile` [НП — e2e на А5 под Playwright Electron].
Проверки (`apps/desktop/src/local-access.ts`, чисти функции): пътят се прекарва през `realpathSync.native` (без бягство
през symlink) и се пази истинският път; отказ за `/` и корен на диск, за домашната папка като цяло и нейните предци, за
системни папки (POSIX: /bin, /sbin, /usr, /etc, /dev, /proc, /sys, /boot, /lib*, /root, /run, /snap, /var/{lib,log,db,root},
/System, /Library, /Applications, /private/{etc,var/db,var/root,var/log}; Windows: Windows, Program Files (x86), ProgramData,
Recovery, $Recycle.Bin, System Volume Information на всеки диск), за папки с тайни в дома (.ssh, .gnupg, .aws, .azure,
.kube, .docker, .config, .password-store, .local/share/keyrings, Library, AppData) и за самия `MANDAT_HOME` (там са
запечатаните ключове); само папка, не файл. На macOS/Windows отказите сравняват без значение на главни/малки букви.
Всяка употреба: истинският път трябва да е вътре в дадена папка (по цели сегменти) с нужното право.
„Приложи локално“ (`apply`): main пуска `node packages/cli/dist/main.js --json apply --task <id> --repo <истинския път>`
без shell и без API ключове в env (`childEnv`), с 120 s лимит; `mandat apply` (D-356) прави само `merge --ff-only` и
отказва при разклонение или локална промяна на засегнат файл — никога reset или checkout -f. Изходът се чете със zod
(`MandatApplyJson`) и трябва да съвпада с exit кода; `files: []` → „вече актуално“.
„Отвори в редактора“ (`open_editor`): `vscode://file/<път>:<ред>` (документирано:
https://code.visualstudio.com/docs/configure/command-line, „Open a file to line and column“, прочетено 24.10.2026), със
същата форма `cursor://file/…` и `zed://file/…` [НП — документацията на Cursor и Zed не е отворена; zed.dev/docs/
command-line-interface даде 404 на 24.10.2026]. Сегментите се кодират поотделно (`#`, `?`, `%`, интервал не могат да
сменят URL-а); преди `shell.openExternal` URL-ът минава последна проверка (само трите схеми с `file/`). Изборът на
редактор е в Настройки → Локален достъп (localStorage на устройството).
Следа: всяка употреба (`apply`, `open_editor`) → ред в `task_activities` (`kind` local_apply / local_editor, авторът)
през `POST /api/tasks/:id/local-activity` (Origin + CSRF като всеки POST, `diff.view`, тяло `LocalActivityBody` — сървърът
сам пише текста; локалната папка не се праща), **не в дневника**: това е действие на човека на неговия компютър, извън
пясъчника и присъдата. Отказ от потвърждението не оставя ред (нищо не е станало).
Уеб: `/projects/add` (екранът), `/settings/local` (списък, отнемане на право или папка, редактор), връзка в Настройки и
блок „На този компютър“ под diff-а на задачата (избор на работно копие от дадените папки, „Приложи локално“ с
`data-desktop-apply` — File → Приложи локално го натиска, „Отвори в редактора“ за всеки файл). Всичко това се показва само
когато мостът го има; в браузър връзката и блокът ги няма, а страниците казват „само в десктоп приложението“.
Агентът в пясъчника не получава нищо: тест `packages/sandbox/src/local-grants-isolation.test.ts` — даването не мени нито
един аргумент на `docker run` (mount-ове, env), дадена папка и файлът с разрешенията пак не могат да се mount-нат, и никой
код от страната на пясъчника/агента/worker-а не чете файла.
Защо: разрешение по папка и по право е най-малкото, което върши работа (P4); истинският път и отказите за системни, домашни
и тайни папки затварят най-честите грешки „дадох твърде много“; потвърждението е нативно, защото диалог в страницата може
да бъде подправен от съдържанието ѝ; файлът е в профилната папка, защото там харнесът вече пази своето и няма втори
източник; следата е в task_activities, защото дневникът е за присъди, а това не е присъда. Регистрирането на дадената
папка като проект на харнеса (ред в repos + огледало) от уеба не съществува днес — Q-061.

## D-374 KEK на ключовете в OS keychain през Electron safeStorage (24.10.2026)
Решение: десктоп приложението пази KEK-а на плика с ключовете (D-313, D-345) в OS keychain чрез Electron `safeStorage`.
На диска е само запечатаният KEK: `MANDAT_HOME/kek.keychain` (0600, атомарен запис: временен файл `wx`, fsync, rename).
При старт main (`apps/desktop/src/kek-keychain.ts`, `resolveDesktopKek`) го отваря и подава KEK-а на детето `pnpm local`
като env `MANDAT_KEK` (base64 на 32 байта) — точно това, което `loadKek` в `packages/llm-proxy` вече чете първо; кодът на
CLI-то и проксито не се мени. Ползва се **асинхронното** API: `isAsyncEncryptionAvailable`, `encryptStringAsync`,
`decryptStringAsync` (при `shouldReEncrypt` същият KEK се запечатва наново), защото синхронното (`isEncryptionAvailable`
и др.) е отбелязано като остаряло. Първи старт с keychain: ако има обикновен `MANDAT_HOME/kek` (направен от `pnpm local`),
той се приема (вече запечатаните ключове остават четими) и **файлът се оставя** (Q-062); иначе нов KEK от `randomBytes(32)`.
Безопасни откази: няма keychain (`isAsyncEncryptionAvailable` → false или грешка; на Linux `getSelectedStorageBackend()`
е `basic_text` или `unknown`, т.е. криптиране с вградена парола) → `source: "file"`, env не се пипа и `loadKek` си ползва
файла 0600 както досега. Запечатан KEK, който keychain-ът не отваря (друг keychain, отказан достъп, повреда, не е 32 байта)
→ също `file` с причина `keychain_locked`, и запечатаният файл **никога не се заменя** с нов KEK (иначе всички ключове
стават нечетими).
Изолация: `childEnv` маха `MANDAT_KEK` (`mandat apply` и другите деца не го получават); само `harnessEnv` го добавя за
`pnpm local`. Пясъчникът: docker CLI-то получава само своите ключове (D-084), а `buildRunArgs` вече отказва `MANDAT_KEK`
в `envNames` и в `publicEnv` на всеки контейнер (нов списък HOST_ONLY в `packages/sandbox/src/hardening.ts`; тест
`packages/sandbox/src/kek-isolation.test.ts`). Нищо не се логва.
Тестове: `apps/desktop/src/kek-keychain.test.ts` с фалшив keychain (XOR с тайна, която знае само той): първи старт,
ключовете оцеляват рестарт (запечатан с `FileKeyStore`, отворен след нов `resolveDesktopKek` със същия keychain), приемане
на стария файл, няма keychain, чужд keychain не заменя KEK-а, повреден запис, `shouldReEncrypt`, env-ът. Истински Electron
(`pnpm --dir apps/desktop smoke`, 44.9.0, macOS arm64): асинхронното API съществува; `getSelectedStorageBackend` по време
на работа е `undefined` на macOS (въпреки типа), затова кодът го вика само на Linux и с `?.`. Истинско криптиране не е
правено в smoke-а: неподписан build на macOS може да поиска достъп до keychain, а нощем няма кой да отговори.
Факти (документацията https://www.electronjs.org/docs/latest/api/safe-storage, прочетена 24.10.2026): macOS — ключът е в
Keychain и е защитен от други потребители и от други приложения на същия потребител; Windows — DPAPI, защитен от други
потребители, **не** от други приложения на същия потребител; Linux — kwallet/kwallet5/kwallet6/gnome-libsecret според
средата, а без хранилище (`basic_text`) данните са незащитени; `isEncryptionAvailable` и `getSelectedStorageBackend` имат
смисъл след `ready`; асинхронното API се инициализира лениво при първото извикване след `ready`.
[НП] дали `getSelectedStorageBackend` отразява и доставчика на асинхронното API на Linux (документацията изрежда за него
Portal Secret / Secret Service / резервен доставчик) — проверка на Linux машина или в CI на А5.
Защо: AC-12.9 иска KEK-ът да е в keychain и ключовете да са налични след рестарт без ново въвеждане; env `MANDAT_KEK` вече
е договореният вход на `loadKek`, така че нищо в CLI/проксито/worker-а не се мени и терминалният `pnpm local` без
десктопа работи както преди. Отказът да се замени неотварящ се KEK пази ключовете от тиха загуба; на Windows защитата е
по-слаба (DPAPI), но пак по-добра от файл 0600 и е същата като на всички Electron приложения.
Алтернативи: синхронното API (остаряло); keytar (отделен native модул и нова зависимост); KEK-ът да остане само във файла (не изпълнява AC-12.9).
Статус: решено.

## D-375 Вграденият терминал на хоста в десктопа: node-pty + xterm.js, само с право `terminal` (24.10.2026)
Решение: в блока „На този компютър“ под diff-а на задачата има бутон „Отвори терминал“, само когато избраното работно
копие е дадено с право `terminal` (D-373). Панелът казва първо „Не е пясъчникът: командите вървят на този компютър, в
<папка>, с твоите права…“ (жълта рамка). Обвивката я пуска main процесът с node-pty (`apps/desktop/src/terminal-sessions.ts`,
чист модул с подадени отвън проверка, зареждане на node-pty и изпращане); уебът рисува с xterm.js
(`apps/web/src/components/host-terminal.tsx`, зареден динамично само в браузъра).
Мост (contract, D-371): методи `terminalOpen {task_id, path, cols, rows} → {id}`, `terminalWrite {id, data ≤ 16 KiB}`,
`terminalResize`, `terminalClose`; main → уеб по същия канал `harness:event`: `terminal_output {id, data ≤ 64 KiB}` (на
партиди от 16 ms, на парчета ≤ 32 KiB), `terminal_exit {id, code}`, `terminal_line {id, task_id, line}`. `TerminalId` =
`term_<16 hex>` (randomBytes). Всяко отваряне минава `authorizeUse(…, "terminal")` наново (истински път, вътре в дадена
папка, с правото); най-много 4 терминала; отнемане на правото `terminal` (или на папката) затваря веднага терминалите там
(`onRevoked` → `closeWhere`); пълно презареждане на страницата (`did-navigate`) и изход от приложението ги затварят всички.
Обвивката: `$SHELL -l` на macOS/Linux (login, за да има PATH-а на човека; GUI приложение тръгва с къс PATH), иначе `/bin/sh`;
на Windows `COMSPEC`, иначе `powershell.exe`. Env: `childEnv` (без API ключове, без `MANDAT_KEK`, без
`ELECTRON_RUN_AS_NODE`) + `TERM=xterm-256color`, `COLORTERM=truecolor`, `MANDAT_HOST_TERMINAL=1`.
Следа (AC-12.8): `LineTracker` (`apps/desktop/src/terminal-lines.ts`) следи натиснатите клавиши: печатни знаци, backspace,
Ctrl+U/Ctrl+C чистят реда, escape последователностите (стрелки, история, маркери на paste, OSC) се пропускат; Enter дава
ред. Tab-допълването и историята стават в обвивката и не се виждат — следата е приблизителна по замисъл. Всеки ред →
`terminal_line` → уебът праща `POST /api/tasks/:id/local-activity` с `{kind: "local_terminal", outcome: "command",
detail ≤ 300}`; отварянето → `outcome: "opened"`. Сървърът минава detail-а през `@mandat/redaction` (`createRedactor`,
същите правила като навсякъде; напр. `export ANTHROPIC_API_KEY=sk-ant-…` → `[REDACTED:anthropic]`) преди да го запише
в `task_activities`, **не в дневника**. Изходът на терминала не отива никъде освен в прозореца.
Агентът в пясъчника не получава нищо: нови mount-ове, env или канали към контейнерите няма; терминалът е на човека.
Зависимости (правило 8, проверено с `npm view <пакет> time` на 24.10.2026): `node-pty` 1.1.0 (MIT, публикуван 22.12.2025)
само в `apps/desktop` (извън workspace, собствен lockfile); `@xterm/xterm` 6.0.0 (MIT, 22.12.2025, без зависимости) в
`apps/web`. node-pty е native: собствените му install скриптове не се пускат (`allowBuilds: node-pty: false` в
`apps/desktop/pnpm-workspace.yaml`), ползват се готовите двоични файлове в пакета. Факти от самия пакет (`npm pack
node-pty@1.1.0` + `tar tvzf`, 24.10.2026): `prebuilds/` има darwin-arm64, darwin-x64, win32-arm64, win32-x64 — **няма Linux**;
`spawn-helper` е с права 644, а без изпълнимия бит всяко пускане пада с „posix_spawnp failed“ (видяно в Electron 44.9.0) —
затова `pnpm --dir apps/desktop run setup` вика и `scripts/setup-pty.mjs`, който прави `spawn-helper` 0755 (pnpm държи
файловете като твърди връзки към общото си хранилище, така че битът се сменя и там — безвредно). Без двоичен файл за
платформата `terminalOpen` отговаря `not_ready` („Терминалът не е наличен в тази версия“), а останалото приложение работи.
Проверено: unit (contract, LineTracker, сесиите с фалшив pty, revoke → затваряне, env/обвивка, сървърът с редакция),
e2e под Playwright (`apps/web/e2e/local-access.spec.ts`: без право няма бутон; с право — надписът „Not the sandbox“,
`terminalOpen` с task_id и папката, написан ред → POST local-activity, затваряне → `terminalClose`; axe 0 serious/critical
на отворения панел в двете теми; мостът е фалшив) и истински Electron (`pnpm --dir apps/desktop smoke`, 23/23 на macOS
arm64): без право → `not_granted`; с право истинската обвивка в дадената папка изпълни `echo SMOKE_$((40+2)); pwd`,
редовете се върнаха, изходът от обвивката се отчете с код 0.
[НП] Linux: build на node-pty (node-addon-api / N-API, значи един двоичен файл и за Node, и за Electron — по документацията
на N-API, не е пробвано) — в А5 (CI файла). [НП] Windows (conpty) не е пускан. [НП] Истинският Next UI в Electron със CSP
(D-371) и xterm.js — в e2e на А5 под Playwright Electron.
Защо: AC-12.8 иска терминал върху работното копие на хоста, ясно обозначен „не е пясъчник“, с команди в task_activities;
node-pty + xterm.js вървят с Electron без промени по прозореца; правото
`terminal` по папка и проверката при всяко отваряне пазят модела на А3; редакцията на сървъра пази правило 5, защото човек
лесно пише ключ в терминал.
Алтернативи: `child_process` без pty (без интерактивни програми, без цветове); терминал в пясъчника (друго нещо — агентът
има своя); следа от изхода вместо от клавишите (шум и тайни в изхода).
Статус: решено (Linux/Windows — [НП] до А5).


## D-376 Самостоятелен пакет на десктопа: харнесът в resources, Node-ът на Electron, electron-builder за 3 ОС (24.10.2026)
Решение: инсталираното приложение носи целия харнес в `resources/harness` и го пуска със собствения Node на Electron
(`ELECTRON_RUN_AS_NODE=1`, Electron 44.9.0 = Node 24.22.0, проверено с `process.versions`), не с `pnpm local` от репо.
Dev (`pnpm desktop`, `app.isPackaged === false`) остава както беше: репото и `pnpm local`.
- `apps/desktop/src/harness-launch.ts` (чист, с тестове): в пакета — команда `process.execPath`, аргументи
  `[resources/harness/packages/cli/dist/main.js, "local"]`, `MANDAT_HOME = <userData>/mandat` (ресурсите са само за четене и
  по-късно подписани), PATH + обичайните места на docker (`/usr/local/bin`, `/opt/homebrew/bin`,
  `/Applications/Docker.app/Contents/Resources/bin`, `~/.docker/bin`; Linux `/usr/local/bin`, `/snap/bin`), защото приложение,
  пуснато от Finder, има къс PATH. `mandat apply` минава през същото (`cliSpawn`), без KEK. Docker остава задължителен:
  проверката е същата (`[1/4] проверка на компютъра` на `mandat local`, D-302) и грешката излиза в диалога на десктопа.
- `packages/cli`: `mandat local` пуска уеба с `process.execPath <next>/dist/bin/next start -p 3000 -H 127.0.0.1` (cwd
  apps/web), не с `pnpm --filter @mandat/web exec next start`. Така и пакетът, и `pnpm local` вървят без pnpm по време на
  работа; `pnpm local` все още прави `pnpm build` първо.
- Пакетът (`apps/desktop/scripts/bundle-harness.mjs`, чистата част `src/bundle-plan.ts` с тестове) има подредбата на репото:
  следените от git файлове без `docs/`, `.github/`, `.claude/`, `apps/desktop/` (нужни са за образите — Dockerfile-ите
  копират контекста, D-078 — за миграциите и за демо фикстурата), `dist/` на всеки workspace пакет, `apps/web/.next` без
  `cache/`, и production `node_modules` (`pnpm install --prod --frozen-lockfile --ignore-scripts --config.node-linker=hoisted
  --filter @mandat/cli... --filter @mandat/web...`). В пакета **няма връзки** (symlinks): инсталаторите не ги носят надеждно
  (electron-builder прави junction-и с абсолютния път на build машината на Windows — видяно в `builder-util/out/fs.js`),
  а копие би преместило кода и repoRoot (изчислен от `import.meta.url`) би сочил грешно. Затова: `node_modules/@mandat/<x>` е
  малък пакет-посредник, който `export *` от истинския файл в истинската папка (`workspaceShim`); вложените `@mandat` връзки
  отпадат (отговаря коренният посредник); `.bin` отпада; външните пакети на Next (`.next/node_modules/pg-<hash>`,
  `typescript-<hash>`, връзки към store-а на build машината) стават истински копия. Скриптът отказва, ако остане връзка или
  native addon извън компилатора на Next (`@next/swc-*`, само за `next build`, изтрива се) — така пакетът е еднакъв за всяка
  ОС/arch. Размер на тази машина: ~420 MB пакет, dmg ~220 MB (arm64 и x64).
- electron-builder 26.17.0 (`apps/desktop/electron-builder.config.mjs`): dmg arm64 + x64, nsis x64, AppImage + deb x64, имена
  `Harness-${version}-${os}-${arch}.${ext}` (macOS дава `mac`, Windows `win`), `identity: null` (без подпис, Q-053),
  `npmRebuild: false` (node-pty е с prebuilds), `asarUnpack` за node-pty, `extraMetadata.productName = "Harness"` (своя
  userData и свой запис в keychain, отделно от dev; Q-063). Всичко се строи извън репото (`$MANDAT_DESKTOP_OUT`, по
  подразбиране `<tmp>/mandat-desktop/{harness,release}`), за да не влиза в Docker контекста на репото и в тестовете.
  Факти от самия пакет (прочетени 24.10.2026): `app-builder-lib/out/util/filter.js` винаги изпуска горния `node_modules` на
  копирана папка → `node_modules` на пакета е втори запис в `extraResources`; electron-builder не взема зависимостите на
  `link:` пакет → `zod`, `yaml`, `canonicalize` (зависимостите на `@mandat/contract`) са изрични зависимости на apps/desktop.
- electron-updater 6.8.10 (`src/updater.ts`): свързан, но **изключен**, докато няма feed: `MANDAT_UPDATE_FEED=github` →
  GitHub Releases на SimoSabev/AI-Harness-NOIT (Q-054), https URL → generic feed (схема `DesktopUpdateFeedUrl` в contract),
  иначе модулът изобщо не се зарежда; в dev — никога. Записът `publish` в конфигурацията само пише `app-update.yml`;
  build-ът е винаги с `--publish never`. [НП] Squirrel.Mac обновява само подписано приложение — до подписа auto-update на
  macOS не е проверен.
- CI: `.github/workflows/desktop-build.yml` строи трите ОС (macos-14, windows-2022, ubuntu-24.04) и качва **само workflow
  artifacts** (`actions/upload-artifact@v7.0.2`, таговете видени с `git ls-remote` 24.10.2026), права `contents: read`,
  без секрети, `CSC_IDENTITY_AUTO_DISCOVERY=false`. Подписът и нотаризацията: `docs/setup/signing.md` (променливите са
  прочетени от `app-builder-lib/out/mac/MacTargetHelper.js` и `options/winOptions.d.ts` 26.17.0, 24.10.2026).
- e2e (`apps/desktop/e2e/desktop.spec.ts`, Playwright 1.63.0 Electron, `pnpm --dir apps/desktop e2e`): срещу собрания,
  непакетиран app с фалшив харнес (`e2e/fake-harness.mjs`, `MANDAT_DESKTOP_FAKE_HARNESS`, уважава се само при
  `app.isPackaged === false`): старт → inbox и броячът (бадж 2 на macOS), мостът без require/process, applyLocal и
  terminalOpen без право → `not_granted`, менюто File → New task → `/tasks/new`, пуснат файл → „Add project“ с пътя и без
  дадено право. 5/5 на macOS arm64.
Проверено на тази машина (macOS arm64, Docker 29.5.2): двата dmg-а се строят; пакетът пуснат с Node-а на Electron мина
целия `mandat local` (образите се строиха от пакета, банерът дойде, `/api/inbox` отговори); Harness.app от
`release/mac-arm64`, пуснат с PATH `/usr/bin:/bin:/usr/sbin:/sbin`, вдигна харнеса и прозорецът показа inbox-а (заглавие
„2 waiting“, прочетено през System Events); спиране на харнеса затвори и приложението, и next-server, порт 3000 се освободи.
[НП] x64 dmg не е пускан (няма Intel Mac); Windows и Linux — само от CI файла, непускан; Linux e2e под xvfb на ubuntu-24.04
може да иска `--no-sandbox` (user namespaces); node-pty на Linux няма prebuild → терминалът отговаря not_ready (D-375).
[НП] Истинският Next UI с CSP в Electron е видян само като заглавие на прозореца, не с e2e срещу истинския уеб (иска Docker и база).
Защо: AC-12.1 иска инсталатор, който работи без репо, pnpm и Node; Node-ът на Electron е същата версия като на харнеса,
затова няма втори runtime; подредбата на репото пази repoRoot, образите и миграциите без промени по CLI-я; без връзки
пакетът оцелява в dmg, nsis и AppImage еднакво.
Алтернативи: Next `output: "standalone"` (сменя build-а на `pnpm local` и пак иска контекста за образите); втори вграден Node
(двойно по-голямо, още един runtime); архив, разпакетиран при първо пускане (бавно, връзките на Windows пак са проблем).
Статус: решено (подпис — Q-053; име — Q-063; Linux/Windows — [НП] до първия CI run).

## D-377 Сайтът за изтегляне `apps/site`: статичен Next, общите токени, манифест на изданията (24.10.2026)
Решение: (1) `apps/site` е Next 16 с `output: "export"` и `trailingSlash: true` (всяка страница е `<път>/index.html`, излиза
в `apps/site/out`); без нови зависимости — next, react, tailwind и @tailwindcss/postcss са със същите версии като в apps/web,
pnpm-lock.yaml получава само нов importer. В workspace-а е (apps/*), затова `pnpm build` (turbo) го строи, а `pnpm check` пуска
тестовете му; `apps/site/turbo.json` пази `out/**` в кеша и следи `tokens.css` и шрифтовете на уеба през `$TURBO_ROOT$`.
(2) Един файл с токени (AC-12.4): шрифтовете и цветовете на двете теми са изнесени от `apps/web/src/app/globals.css` в
`apps/web/src/app/tokens.css`; уебът го внася с `@import "./tokens.css"`, сайтът с `@import "../../../web/src/app/tokens.css"`.
Тест (`apps/web/src/app/tokens.test.ts`) пада, ако друг CSS файл под apps/ дефинира цветовете или някой спре да го внася.
Шрифтовете и иконата се копират от `apps/web/public` при build (`apps/site/scripts/copy-assets.mjs`; копието е в .gitignore).
(3) Езици: английски на `/`, български на `/bg/` (статичен export няма сървър за Accept-Language); два root layout-а
(`(en)` и `(bg)/bg`), за да е `<html lang>` верен; 404 е `app/global-not-found.tsx` с `experimental.globalNotFound`
(Next docs, „not-found.js“ → global-not-found, експериментално от v15.4.0, прочетено 24.10.2026:
https://nextjs.org/docs/app/api-reference/file-conventions/not-found). Каталогът е като на уеба (`apps/site/src/i18n`,
en изворът, bg преводът, тест за същите ключове и за кирилица извън каталога). Темата следва системата (`data-theme="system"`).
(4) „Изтегли за <твоята ОС>“: чиста функция `detectOs` (User-Agent Client Hints, после User-Agent; iPad, който се представя
като Mac, по maxTouchPoints) в браузъра; статичният HTML казва „Изтегли“ → `/download/`; телефон → `/download/#phone` (PWA, D-289).
(5) `/download`: петте инсталатора (mac arm64/x64 dmg, win x64 exe, linux AppImage/deb) с SHA-256 и размер от
`apps/site/releases.json`; схемата е `SiteReleaseManifest` в packages/contract (правило 11) и се проверява при build — счупен
манифест чупи build-а. Без издание (`version: null`) всеки ред казва „Скоро“, без линк. Линкът е
`https://github.com/SimoSabev/AI-Harness-NOIT/releases/latest/download/<файл>` (Q-054) — GitHub документира
`/releases/latest/download/<asset>` като линк към файл от последното издание (https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases,
прочетено 24.10.2026). Имената носят версията (`Harness-<версия>-<ос>-<arch>.<ext>`, D-376), затова манифестът трябва да е
на последното издание: `node scripts/release-manifest.mjs [--dir] [--out] [--version]` чете папката на electron-builder
(`$MANDAT_DESKTOP_OUT/release`), хешира файловете и пише JSON-а; само чете локални файлове, не качва нищо.
Проверено: върху двата истински dmg от А5 дава 0.1.0 с два файла; сайтът, построен с него, показва двата линка и хешовете,
останалите три реда — „Скоро“. В репото манифестът остава празен, докато няма издание (иначе линковете биха били 404).
(6) Изисквания на страницата: Docker ≥ 25.0.5 и ≥ 2 CPU, ≥ 10 GB свободно (D-302); приложението ~1 GB (измерено:
Harness.app arm64 731 MB), образите ~5 GB (измерено: sandbox 1,66 GB + proxy и gate по 361 MB + база).
(7) Без аналитика, бисквитки и външни заявки (PRD-15): тестът `apps/site/src/export.test.ts` минава по `out/` — всички страници
и в двата езика, всеки вътрешен линк, `#котва` и `url()` в CSS-а съществуват, няма script/link/img/iframe към друг хост,
`<a>` навън само към репото, няма `document.cookie`/storage/beacon. Клиентският бандъл на бутона не внася zod/манифеста.
Защо: една и съща визия без втори източник на цветове; статичният сайт може да седи на всеки хостинг и не праща нищо към нас;
„Скоро“ вместо счупен линк, докато Симо не публикува издание.
Алтернативи: копие на токените в сайта (два източника, AC-12.4 пада); `[lang]` сегмент с redirect от `/` (статичен export
няма redirect, а `/` трябва да е страница); линк към конкретен tag (иска версията в URL-а и пак манифест).
[НП] Хостингът (GitHub Pages под под-път `/AI-Harness-NOIT/` чупи абсолютните `/fonts/` и `/_next/`) — Q-064; axe и
снимките на UI-я са в следващата стъпка (документацията).
Статус: решено (хостингът — Q-064).

## D-378 Документацията на сайта: `/docs` като данни, SVG с токените, истински снимки на UI-я, axe (24.10.2026)
Решение: (1) Осем страници под `/docs/<slug>/` и `/bg/docs/<slug>/` плюс индекс `/docs/`: Първи стъпки, Как работи, Присъдите,
Десктоп и локален достъп, Нощна смяна, Сигурност, Абонамент и ключове, ЧЗВ. Всяка страница е списък от блокове
(`apps/site/src/lib/docs.ts`: заглавие, абзац, списък, команда, таблица, диаграма, снимка, ЧЗВ), а един рендер
(`views/doc-page.tsx`) ги прави на HTML за двата езика; текстът е само ключ от каталога (`i18n/docs-en.ts` изворът,
`docs-bg.ts` преводът; статичният тест за кирилица ги допуска), командите са код и не се превеждат. `generateStaticParams` +
`dynamicParams = false` → всичко е статично.
(2) Съдържанието не измисля поведение: фактите са от PRD (F1, F3, F6, F11, F12, 6.10, известните граници 10.2), D-292…D-377,
docs/glossary.md и кода (SANDBOX_HARDENING, `decideVerdict`, детекторите). Примерите в таблицата D1–D12 са изреченията на
`explain()` от packages/contract (сайтът го вика при build, рамката `<untrusted>` става «…» като на картата — `lib/reasons.ts`,
същата логика като `apps/web/src/lib/verdict-view.ts`); D7 и D10 нямат explain текст → резюмето от `d7.ts`/`d10.ts`.
D6 („тресчотка“ за suppressions) и D9 нямат реализация → „Няма го в тази версия“, не измислен пример.
(3) Диаграми: ръчни inline SVG (`components/diagrams.tsx`) — пътят на задачата, правата върху папки, цикълът на нощната смяна,
къде е ключът. Само класове от токените (fill-/stroke-/text-), затова следват двете теми; надписите са в `<foreignObject>`,
за да се пренасят сами на английски и български. Всяка е `role="img"` с `<title>` и `<desc>` (пълното значение), тест в
`export.test.ts` пада при SVG без тях или с твърд цвят.
(4) Снимки: `scripts/site-shots.mjs` (Playwright от apps/web) снима 5 екрана (`apps/site/shots.json`, схема `SiteShotList`
в contract) × en/bg × тъмна/светла в `apps/site/public/shots` (20 PNG, ~2,4 MB, 1280×800). По подразбиране пуска същия уеб
сървър като `pnpm local` (`next start`, локалният собственик без вход, D-368) на порт 3210 срещу временна база `mandat_shots`
на Postgres-а на `pnpm local` (127.0.0.1:54329) с демо данните (`seedDemo`) и етикетирания пример (`sample=1`), после я трие.
Защо не базата на `pnpm local`: в нея са истинските задачи и репота на човека, а снимките се комитват (Q-065); `--url` снима
работещ `pnpm local`, ако Симо иска. Уеб сървърът не получава ключове и KEK (тест). Екранът „Акаунти“ не е сниман: без
control endpoint показва „Ключовете се задават при pnpm local“ — подвеждащо в документацията; вместо него е Дъската.
На страницата `<picture>` дава светлата снимка при `prefers-color-scheme: light`, иначе тъмната. Тест: и четирите варианта на
всеки екран съществуват; липсваща снимка е провал, не фалшиво изображение.
(5) Тестове: export тестът знае новите страници (двата езика, всяка докс страница линква всяка друга, един h1, alt ≥ 12 знака,
`srcset` в проверката на линковете; имената на атрибутите вече са без значение за регистъра — React пише `srcSet`).
axe: `apps/site/e2e/a11y.spec.ts` (`pnpm --filter @mandat/site e2e`) пуска `scripts/serve.mjs` (само 127.0.0.1, като статичен
хостинг) и проверява всички 22 страници в тъмна и светла тема → 0 serious/critical, без хоризонтален скрол на 375 px, и че
светлата снимка се ползва в светла тема. Минава 4/4 (24.10.2026). Не е в `pnpm check`, защото иска браузър — като e2e на уеба.
@playwright/test 1.63.0 и @axe-core/playwright 4.13.0 са същите версии като в apps/web (без нов пакет в lockfile-а).
(6) Деплой: `docs/setup/site.md` (локално, издание, снимки, GitHub Pages, Vercel, проверки след деплой); нищо не е деплойнато.
Защо: една структура за двата езика пази страниците еднакви; изреченията от contract не могат да се разминат с картата;
истинските снимки показват точно това, което човек ще види, без чужди данни.
Алтернативи: MDX (нова зависимост и втори източник на текст извън каталога); снимки с ръка (остаряват, няма двете теми);
снимки от базата на `pnpm local` (лични данни в репото).
[НП] Пътищата в системните предупреждения (macOS: System Settings → Privacy & Security; Windows: SmartScreen → More info) и
менютата на GitHub Pages/Vercel в site.md не са проверени нощес.
Статус: решено (хостингът — Q-064; базата за снимките — Q-065).

## D-379 Преглед от скептик на E9g: KEK само в процеса на CLI, папки над системни, линкове към изданието на версията, линкове навън в браузъра (24.10.2026)
Решение: прегледът на целия diff на `phase/e9g-desktop-pro` (от 7b4523a) намери и поправи (тест първо, отделни комити):
(1) KEK-ът от keychain (D-374) стигаше до уеб сървъра (`next start`) и до системните задачи (D-370): `mandat local` им даваше
env-а си с `MANDAT_KEK`. Нито едното не го ползва (ключовете се отварят в прокси старта и в worker-а — в процеса на CLI).
Сега `localWebEnv` и новата `localJobEnv` (packages/cli/src/commands/local.ts) го махат; тест в local.test.ts.
(2) Можеше да се даде папка, която СЪДЪРЖА системна: `/var` (над `/var/lib`, `/var/log`), `/private` и `/private/var`
на macOS (над `/private/etc`). `checkGrantable` вече отказва и предците на системните папки (причина `system`); `/var/www`,
`/private/tmp/...` остават позволени. Освен това `authorize` брои запазено право само докато папката му още може да се
даде — ръчно редактиран или по-стар `local-grants.json` с `/`, домашната или `/etc` не дава нищо. Предците на профила
(MANDAT_HOME) остават позволени нарочно: в dev профилът е `<репо>/.mandat` и човек трябва да може да даде самото репо
(тестът от А3 го пази).
(3) Линковете на `/download` бяха `releases/latest/download/<файл>`, а имената носят версията (D-376): след по-ново издание
линкът към стария файл става 404, а SHA-256 на страницата описва друг файл, докато сайтът не се построи отново. Сега
`siteDownloadUrl` сочи изданието на версията на файла: `https://github.com/SimoSabev/AI-Harness-NOIT/releases/download/v<версия>/<файл>`
(`siteReleaseTag`). Тагът `v<версия>` е по подразбиране на GitHub публикуването на electron-builder: `tagNamePrefix`
/ `vPrefixedTagName` „@default true“ в builder-util-runtime 9.7.0 `out/publishOptions.d.ts` (зависимост на electron-builder
26.17.0, прочетено 24.10.2026). [НП] Формата `releases/download/<таг>/<файл>` е този, който GitHub дава за всеки файл на
издание; страницата на GitHub за него не е отваряна нощес. site.md е обновен.
(4) Прозорецът отказваше всеки нов прозорец (D-303) и така линковете с `target=_blank` не правеха нищо — сред тях входът в
абонамент (account-login.tsx, D-369), източниците в Проучване и линковете в текста на задача. Сега `attachGuards` подава
такъв линк на `shell.openExternal` (системния браузър) само ако `outsideUrl` го пусне: http(s), друг origin, без
`user:pass@`, ≤ 2048 знака; `file:`, `javascript:`, `data:`, `vscode://`, `smb://` и локалният адрес не излизат. Прозорец в
приложението пак не се отваря никога. Smoke-ът в истински Electron записва линка, без да го отваря (всички проверки минават на този Mac, Electron 44.9.0).
Документацията (Десктоп → „Прозорецът е заключен“) го казва на двата езика.
Само докладвано (без промяна): виж docs/reports при стъпка 9 и Q-066 (доверието в страницата: XSS → терминал без
потвърждение); `'unsafe-inline'` в CSP остава [НП] (D-371); пакетът носи и `apps/site` (изходниците и снимките, ~2,5 MB) —
безвредно, не е махнато, за да не се пипа frozen lockfile-ът на пакета без изпробване.
Защо: ключът и правата са най-ценното на десктопа — всяко място, до което стигат, без да трябва, е излишен риск; линк и
хеш трябва да описват един и същ файл; входът в абонамент трябва да работи и в десктопа, без прозорецът да губи заключването.
Алтернативи: KEK в env на всички деца (както беше — по-широко от нужното); отказ само на системните папки (`/var` пропуска);
`latest` линкове с повторно строене при всяко издание (лесно се забравя); вграден прозорец за входа (нарушава D-303).
Статус: решено.

## D-380 Десктопът тръгва на този Mac: Node-ът на Electron и в dev, проверка за git, ad-hoc подпис на Mac (24.10.2026)
Повод: `pnpm desktop` на Mac-а на Симо спря на [1/4] с „Node 26.4.0: нужен е Node 24“ (exit 3). Преглед от скептик
на целия път на пускане (dev и инсталираното приложение) намери три блокера; поправени са с тестове първо.
(1) В dev десктопът пускаше `pnpm local`, а той — `node` от PATH (тук Homebrew 26.4.0), който `mandat local` отказва
(D-302 иска Node 24). Сега и в dev, както в инсталираното приложение (D-376), харнесът се пуска с Node-а на Electron
(`ELECTRON_RUN_AS_NODE=1`, Electron 44.9.0 носи Node 24.22.0 — проверено: `ELECTRON_RUN_AS_NODE=1 electron -e` →
`24.22.0`), директно `packages/cli/dist/main.js local`; същото за еднократните пускания (apply). `pnpm desktop` строи
харнеса първо (`pnpm build`), защото `pnpm local` вече не го прави вместо него. Подсказката на CLI казва
`brew install node@24 или nvm install 24` (nvm липсваше на този Mac).
(2) `mandat local` вика git (демо хранилището, износът), но не го проверяваше: на Mac без Command Line Tools `/usr/bin/git`
е само заместител и грешката идва на [2/4], след като базата вече е създадена. Сега предварителната проверка има ред за
git с „xcode-select --install“.
(3) `mac.identity: null` в electron-builder 26.17.0 значи „без никакъв подпис“ (`MacTargetHelper.handleNullIdentity`,
прочетено в `app-builder-lib/out/mac/MacTargetHelper.js` 24.10.2026); Electron.app е само linker-signed и след
промените на electron-builder подписът не покрива ресурсите. На Apple Silicon такова приложение, свалено от браузър
(с quarantine), macOS обявява за „повредено“ без изход през настройките. Сега `identity: "-"` (ad-hoc — същият файл,
клонът `qualifier === "-"`) и `hardenedRuntime: false` (с ad-hoc и hardened runtime electron-builder предупреждава за
нужни entitlements). Тогава macOS казва, че не може да провери приложението, и предлага System Settings → Privacy &
Security → Open Anyway, без терминал. Това не е подпис с Developer ID (Q-053 остава): нищо не е качено, нищо не е
нотаризирано (правило 3). [НП] Точният текст и бутонът на macOS 26 за ad-hoc приложение — проверка на живо от Симо
(local-live-checklist, ред 25).
(4) При проверката на живо dev прозорецът не се появи: десктопът чакаше keychain-а (`safeStorage.decryptStringAsync`)
преди да отвори прозорец, а macOS не отговаряше (процесът стоеше в mach_msg, без прозорец). Сега прозорецът, tray-ят и
менютата идват първи; ако keychain-ът не отговори за 1,5 s, редът на зареждане казва какво става, а след 30 s
диалог пита „Чакай още“ или „Изход“. Междувременно нов ключ не се прави никога (запазените ключове остават четими).
При повторното пускане keychain-ът отговори и харнесът тръгна за около 8 s.
`MANDAT_MAC_ARCH` избира архитектурата на dmg (`arm64` за `pnpm site:mac`; по подразбиране arm64 и x64).
Докладвано, не поправено: първото пускане строи 3 образа от изходния код (минути, нужен е интернет); dev и
инсталираното приложение делят една база и порт 3000; в x64 приложението spawn-helper на node-pty не е изпълним
(терминалът там ще откаже); не е проверено пускане направо от dmg-то без копиране в Applications.
Защо: целта е човек да свали един файл, да го отвори и харнесът да тръгне, с възможно най-малко команди.
Алтернативи: да се иска Node 24 на машината (още една инсталация за човека); без подпис (не се отваря изобщо);
hardened runtime с entitlements файл (повече части без полза до нотаризация).
Статус: решено.

## D-381 Сайтът може сам да раздава инсталатора: `pnpm site:mac` (24.10.2026)
Симо поиска от сайта да се изтегля инсталатор, засега само за Mac с Apple Silicon (това, което може да се пробва тук).
Публикуване в GitHub Releases не е позволено без Симо (правило 3), затова манифестът на сайта получи `host`:
`github` (по подразбиране, линк към изданието, D-379) или `site` — файлът е в самия сайт под `/downloads/`.
`pnpm site:mac` (scripts/site-local-release.mjs) с една команда: строи dmg-то за arm64 (`--publish never`), копира го в
`apps/site/public/downloads` и пише `apps/site/releases.local.json` (и двете са в .gitignore — 220 MB не влизат в git),
строи сайта, пуска го на 127.0.0.1:3101 и отваря `/download/`. Ако `releases.local.json` има, той печели пред
`releases.json`; сайтът отказва да се построи, ако файл от него липсва или е с друг размер (никога счупен линк).
Локалният сървър дава инсталатора с `Content-Disposition: attachment`. Страницата за изтегляне показва стъпките за Mac
без терминал (Docker Desktop → плъзни в Applications → Done → Privacy & Security → Open Anyway → първото пускане
строи образите). Windows и Linux остават „Скоро“ (CI файлът ги строи, когато Симо реши, Q-064).
Защо: Симо иска да изтегли и пусне приложението от сайта с минимум команди, без да се публикува нищо.
Алтернативи: да се качи издание в GitHub (забранено без Симо); dmg-то в git (огромно); линк към файл извън сайта
(file:// не се тегли от браузъра като нормално изтегляне).
Статус: решено.

## D-382 Логото: кутия, от която излиза само проверената отметка (24.10.2026)
Симо избра от ChatGPT Images изометрична кутия с отметка и верига вътре. Картинката е растер с текстура и релеф и не
става на 16 px, затова е прерисувана като точна геометрия в `scripts/brand-icons.mjs` (единственият източник):
шестоъгълник с връх нагоре, разрязан по трите вътрешни ръба на кутията (горе вляво, горе вдясно, долу); отметката стои
в нея и излиза през горната страна. `node scripts/brand-icons.mjs` (Chromium на Playwright от apps/web, MANDAT_CHROMIUM
като в site-shots) пише в apps/web/public: `logo-mark.svg` (един цвят — CSS маска), `favicon.svg` (акцентът на
системната тема), `icon-192/512.png` (плочка по мрежата на Apple: 824 от 1024, радиус 185), `icon-maskable-512.png`
(PWA: цял фон, знакът в безопасния кръг от 40 %) и `trayTemplate.png` + `@2x` (менюлентата на macOS).
(1) Логото в горната лента на уеба и на сайта е `.logo-mark` от tokens.css (маска + bg-accent), затова следва темата;
шестоъгълникът `.hex` остава за статусите, агентите и проектите. (2) Пълната икона (Dock, лентата със задачи, PWA) е в
тъмните токени, осветена отгоре: горната страна = accent, лявата и дясната по-тъмни към canvas, отметката в accent-text;
веригата е само в нея (на 16–32 px се слива). (3) Faviconът е SVG за двете теми + icon-192 за браузъри без SVG; сайтът го
копира от apps/web/public (copy-assets.mjs). (4) PWA: theme_color и background_color = тъмният canvas (беше синьото
#1f5fd1 от старата икона). (5) Десктопът: иконата на приложението си остава icon-512 (вече новата); в менюлентата на
macOS е шаблонно изображение — „черно и алфа канал“, името завършва на `Template`, `@2x` за Retina
(https://www.electronjs.org/docs/latest/api/native-image, 24.10.2026); на Windows и Linux е icon-192, както беше.
Тестове: scripts/brand-icons.test.ts (SVG-ите са изходът на скрипта, цветовете = токените, само отметката излиза от
кутията, размерите на PNG), tokens.test.ts (`.logo-mark`), brand.test.ts (PWA), export.test.ts на сайта (лого и favicon на
всяка страница), harness-launch.test.ts (иконата в менюлентата).
Защо: Симо, 24.10.2026 — лого „хем за харнеса, хем за сайта, хем за десктоп приложението“; избра варианта с кутията.
Геометрията пази идеята (кутия, три среза, отметка навън, верига) в плоски тонове, които вървят с приглушения дизайн (D-305).
Алтернативи: картинката както е (размазва се малка, текстурата не пасва на D-305); плътен шестоъгълник с изрязана отметка
(по-прост, но прилича на обикновена значка „потвърдено“).
Не е проверено на живо: иконата в Dock-а на собран dmg и в менюлентата (иска `pnpm site:mac` или пуснат десктоп).
Статус: решено.

## D-383 Логото е самата картинка с текстурата, не прерисовката (24.10.2026)
Решение: отменя плоската прерисовка от D-382. Логото е картинката, която Симо избра, както е:
`scripts/brand/logo-source.webp` (ChatGPT Images, 1254 × 1254, с текстурата и релефа). `scripts/brand-icons.mjs` само я
реже: `logo.png` (256 px, кутията отблизо със заоблени ъгли: горната лента на уеба и сайта чрез `.logo-mark` в tokens.css и
иконката в раздела на браузъра), `icon-192/512.png` (плочка по мрежата на Apple: Dock, лентата със задачи, PWA) и
`icon-maskable-512.png`. `logo-mark.svg` и `favicon.svg` са махнати; иконката в раздела вече не следва темата (картинката
е с тъмен фон и в двете). Изключение: менюлентата на macOS остава едноцветният силует на същата кутия
(`trayTemplate.png`), защото шаблонното изображение е „черно и алфа канал“ (D-382); цветна картинка там системата не
оцветява и на тъмна лента е тъмен квадрат.
Тестове: scripts/brand-icons.test.ts (източникът е WebP 1254 × 1254, изрезите са изцяло в картинката, шаблонът е един цвят,
размерите на PNG), tokens.test.ts, brand.test.ts, export.test.ts на сайта.
Защо: Симо, 24.10.2026 — „към това с най-тежката текстура, точно това, което аз ти пратих, а не това лекото“.
Цена: на 16–28 px текстурата и веригата се сливат; в светлата тема логото е тъмна плочка.
[НП] Правата върху картинката: генерирана е от Симо с ChatGPT Images; условията на OpenAI за изхода не са проверени тук.
Статус: решено.

## D-384 Опростяване, фаза 1: три раздела, един вход за задача, без примери (24.10.2026)
Решение (docs/reports/ui-ux-simplify.md, фаза 1):
(1) Страничната лента има три раздела: Задачи (`/`), Проекти (`/harness`), Настройки (`/settings`) — `apps/web/src/lib/nav.ts`.
Останалите страници (Преглед, Дъска, Документи, Агенти, Инструменти, Нощна смяна, Проучване, Акаунти, Система) не са
изтрити: отварят се по линк и светват раздела, под който живеят. Проекти = правилата на всеки проект + „Добави проект“;
профилът на агентите и скритите тестове са под „Разширени“. Настройки = Акаунти, Език, Тема, Локален достъп и „Разширени“
(Система, Инструменти, Роли — ролите само извън локалния режим). Махнати: горната лента с втори „+ Нова задача“, списъкът с
проекти в лентата (и с него ⌘1–9), бутонът за тема в лентата (темата е в Настройки), „Изглед на главната“, картата с TUI.
(2) Един вход за задача: полето на `/`. `/tasks/new` пренасочва към `/` (с `?text=` от нощен въпрос); формата
`new-task-form.tsx` е махната. Изборът на обхват остава в CLI и в правилата на проекта (.mandat.yml); от полето реален агент
тръгва „без ограничения“ (D-360), както и досега.
(3) Демо агентите (`fake:*`) не са в избора по подразбиране: `agentChoices` дава влезлите акаунти и агентите с ключ; демото
само с `MANDAT_DEMO_AGENTS=1` (e2e го пуска). Без нито един агент полето показва „Влез в акаунт“ вместо бутон, който пуска
сценарий. Един агент → само името му; под полето — само проектът (без имейл и план).
(4) Примерният режим (D-307, D-332) е махнат: `lib/sample.ts`, `withSample`, „ПРИМЕР“ бележките и превключвателят.
Страниците показват само истински данни; панелите „Отворени прозорци“ (нищо не пише в `open_windows`) и празната
„Сесията отвътре“ на задача без записана сесия не се показват.
(5) Текст: без D-номера и вътрешни имена в UI (D5, D12, D-367, „слоеве A–H“, worker, base, износ, „вратата“, прокси,
ANTHROPIC_API_KEY, 429, „Ресърч“, „Тулове“); едно име за състояние („Не можа да се провери“, „Няма промени“, „Добавена
автоматично“, „Кодът се промени междувременно“); без „Присъда · VERIFIED“ (английски enum в bg) и без id на детектора до
всяка проверка. „Харнесът“ в текстовете стана „приложението“ — името на продукта остава празно по D-296.
(6) Десктоп: без менюто „Клавиши“, без ⌘K (търсенето нямаше поле, винаги отваряше Дъската) и без ⌘1–9; ⌘N и ⌘↩ са на
своите редове във „Файл“; „Изглед“ = Задачи / Проекти / Настройки; „Нова задача“ отваря `/`. Договорът (DesktopView,
DesktopCommand) е свит съответно.
(7) CLI: bench, redteam, fixtures, contract, ladder, anchor, worker и demo работят, но не са в `mandat --help`.
Тестове: lib/nav.test.ts, lib/agents.test.ts (agentChoices), desktop-commands.test.ts, contract desktop.test.ts, desktop
menu/shortcuts/bridge-main тестове, cli.test.ts (help), e2e workbench/inbox/night/settings.
Защо: Симо, 24.10.2026 — „всичко да е абсолютно елементарно, бързо и лесно… без излишни менюта, бутони“; четирима критици
намериха 12 раздела за поток от 3 стъпки, три „+ Нова задача“ на един екран, примерни данни в инструмент за доверие и
демо агент по подразбиране, който пренебрегва написаното.
Алтернативи: да се изтрият и страниците (Проучване, Агенти, Нощна смяна, Дъска, Документи) — чака отговор (фаза 4).
Статус: решено.

## D-385 Преглед на файловете: бинарни файлове и промяна над 1 MB (24.10.2026)
Решение: (1) `splitDiff` (apps/web/src/lib/diff-view.ts) брои заглавките на git (`index`, `---`, `+++`, режими) само преди
първия `@@` на файла; в hunk ред „-- коментар“ е изтрит ред, а „++ …“ е добавен. (2) Файл с „GIT binary patch“ или
„Binary files … differ“ е `binary: true` и е без редове (base85 не се пази за четене); прегледът и картата казват
„бинарен файл — без преглед“, а `addedContent` връща null. (3) Промяна над 1 MB: worker-ът пише ред в `changeset_diffs`
с `diff = ''` и `omitted_bytes` = размера на patch-а (миграция 20261024000026; check: omitted_bytes > 1 MB и само с празен
текст). Библиотеката показва задачата без файлове, а картата и задачата на живо (`TaskDetail.diffOmitted`) пишат колко MB е
промяната и че е в клона на задачата. Видимостта е като на diff-а (approver+ по RLS). Задача без ред в changeset_diffs
(няма промяна или има изтекла тайна) остава извън Библиотеката, както беше.
Тестове: diff-view.test.ts, markdown.test.ts, library.test.ts, rls-web.test.ts, worker daemon.test.ts, pgTAP diff_omitted.test.sql.
Защо: прегледът с критик (24.10.2026) намери, че при промяна над 1 MB задачата тихо изчезва от Библиотеката, че нов PNG дава
празен „Преглед“ и че SQL коментар в изтрит ред се губи и броячите лъжат.
Алтернативи: да се пазят пълните файлове след промяната в Storage (дава преглед на променени и бинарни файлове и изтегляне),
но това е отделна стъпка (M), не бърза поправка.
Статус: решено.

## D-386 Опростяване, фаза 2: една страница за задача (24.10.2026)
Решение (docs/reports/ui-ux-simplify.md, фаза 2):
(1) Една страница за задача: `/?task=<id>` (списъкът вляво, задачата в средата). `/tasks/<id>` пренасочва там
(`taskHref` в lib/nav.ts — и линковете от преглед, дъска, агенти и известията на десктопа). Махнати: втората страница
със стъпките „агентът работи → проверява → решение“, страничната колона „Как се строи / Файлове / Числа / Проверки“,
линкът „Подробно“ към другата страница, `steer-box.tsx` (насочването е полето под разговора, докато агентът работи).
(2) Докато агентът работи: разговорът на живо, „Спри“ и поле за насочване. Когато свърши — отгоре надолу: едно изречение
с присъдата и причините (цветът е на присъдата: ПРОВЕРЕНО зелено, ПРОВАЛ червено, НЕПРОВЕРЕНО кехлибарено) → промяната
→ снимките преди/след (D12) → бутоните (и „Приложи локално“ в десктопа) → картите за разрешение. Под тях, свити: „Какво
направи агентът · N стъпки“ (разговорът) и „Подробно“ (време, разход, токени, контекст, всички проверки, доверие, сесията,
дневникът) — `components/task-details.tsx`, рендерирани на сървъра.
(3) „Чака теб“ е кехлибарено: статусът „Чака одобрение“ вече не е зелен като „Одобрена“ (`TONES.review = amber`); всичко,
което чака човека, е кехлибарено или червено.
(4) Пусни отново с бележка: при провал / непроверено / няма промени / изместен код има поле „Бележка към агента (по
желание)“ и „Пусни отново“ — без бележка е досегашният retry, с бележка е apply-comments (нов опит; работникът подава
бележката на агента като „Notes from a person“, apps/worker/src/online/daemon.ts). Промяна, която чака одобрение, има
„Върни с бележка“ (беше „Приложи коментари“). Бележката се вижда в разговора като насочване (chat-feed: kind steer|review).
Кое действие има всеки статус е чистата функция `actionsOf` (lib/status.ts).
Тестове: lib/status.test.ts (тонове, outcomeTone, actionsOf), lib/nav.test.ts (taskHref), chat-feed.test.ts (бележката в
разговора), desktop-commands.test.ts (open_task), e2e inbox/asks/board/lang-bg/ui-shots на новата страница.
Защо: критиците (docs/reports/ui-ux-simplify.md) — две различни страници за една задача, „Одобри“ над промяната (одобряваш
на сляпо), едно състояние в три формулировки, „чака теб“ в зелено като „готово“, провал без следваща стъпка.
Отворено: UNKNOWN още не може да се одобри ръчно (въпрос 1 в доклада) — само „Пусни отново“ или бележка.
Статус: решено.

## D-387 Опростяване, фаза 3: първо пускане (24.10.2026)
Решение (docs/reports/ui-ux-simplify.md, фаза 3):
(1) Docker, който не отговаря, се чака: `mandat local` пише една стъпка „[1/4] Чакам Docker: пусни Docker Desktop
(продължавам сам, щом тръгне)“ и пита на 3 s до ~10 мин (`waitForDocker`); десктопът я показва в прозореца за пускане.
(2) Ако харнесът спре, преди да се отвори (Docker, зает порт…), десктопът показва причината с „Опитай пак“ (по
подразбиране) и „Изход“ вместо прозорец с грешка и изход (`startFailed` в banner.ts; „Опитай пак“ пуска `local` отново).
(3) Образите на пясъчника: `mandat images build` е дете на `local`; изходът му става един ред „[3/4] Образи на пясъчника:
2 от 3 · стъпка 4/9 · 3 мин (обикновено 5–15 мин)“, обновяван при всяка стъпка на BuildKit и на 15 s (`imageEvent`,
`imagesStep`). Новите текстове минават през каталога на CLI (MANDAT_LANG).
(4) Вход в акаунт: един бутон „Влез с Claude“; името на акаунта има стойност по подразбиране и се сменя само под „Друго
име на акаунта (по желание)“. „Отвори страницата за вход“ вместо „Отвори claude.com“ до „Влез в claude.ai“. API ключовете
и каналите са свити под „Имаш API ключ вместо абонамент?“.
(5) Изборът на проект: в полето за задача, само ако проектите са повече от един; `CreateTaskBody.repo` (uuid, по желание) —
задачата отива в избрания проект на организацията, чужд или несъществуващ → 404 `unknown_repo`.
Не е направено: „Добави проект“ от браузъра (Q-061). Регистрацията (огледало + ред в repos + сканиране) е лесна, но в
локалния режим работникът доставя одобрените правила (`harness_pr`) и задачите през един настроен `ghRepo` (демото) —
правилата на нов проект биха отишли в чуждо хранилище, а без тях задачите спират с `policy_missing`. Нужна е доставка по
проект в работника; чака решение на Симо.
Тестове: local.test.ts (waitForDocker, imageEvent, imagesStep), banner.test.ts (startFailed), free-task.test.ts (избраният
проект), agents.test.ts (CreateTaskBody.repo), e2e workbench (свитите API ключове).
Не е проверено на живо: чакането на Docker и прогресът на образите в собран десктоп (иска спрян Docker / изтрити образи).
Статус: решено (без т. Q-061).

## D-388 „Добави проект“ от браузъра и доставка по проект в работника (24.10.2026, отговор на Q-061)
Решение:
(1) Работникът вече няма едно хранилище за всичко. `ghFor` (apps/worker/src/online/gh-target.ts) решава за всеки проект:
GitHub проект → неговото хранилище през GitHub на работника; демо хранилището (`GITHUB_DEMO_REPO`) → както досега (fake
офлайн, Writer App онлайн); локален проект, добавен на този компютър → само офлайн GitHub (`localGh`, fakeGitHub с
`autoRepos`) под собственото си име, никога истински GitHub. По проект са доставката на задачата, авто-сливането, CI
кръговете, одобрителните ефекти (`approval_check`, `ready_for_review`) и правилата на хранилището (ruleset) при сканиране.
(2) Собствен локален проект се доставя само през огледалото си: одобрените правила стават клон
`mandat/harness-<proposal>` с един комит върху сканираната база и main се мести напред до него (fast-forward, както D-367;
повторно пускане не прави нищо; main, който се е изместил, е отказ — сканирай отново). Ниво 2–3 без автоматично прилагане
по D-367 не „слива“ фалшив PR: чака човека (HELD approval). Задачата намира `.mandat.yml` в базата си.
(3) Добавяне (`addLocalProject`, apps/worker/src/online/add-project.ts): папката на git проект на този компютър (пълен
път) → голо огледало `MANDAT_HOME/projects/<име>.git` (main = текущият комит на папката, каквото и да е името на клона ѝ;
`mandat.source` пази папката, така че същата папка втори път е същият проект) → ред в repos (`local/<име>`, main) →
сканирането на правилата е на опашката. Папката само се чете. Отказ с причина: няма папка, не е git, няма комит, папка на
самото приложение. Пътят минава zod три пъти: уеб API (`POST /api/repos`, право `projects.manage`, CSRF), контролният
endpoint на `pnpm local` (`POST /projects`, 127.0.0.1 + токен) и `AddProjectBody` в договора.
(4) Уеб: „Добави проект“ в браузъра е поле за пълния път + „Добави проекта“; в десктопа — избор на папка, права, после
същото добавяне само (вместо „пусни pnpm mandat init“). След добавяне: „Към проектите“, където правилата чакат одобрение.
Тестове: gh-target.test.ts, gh-target-effects.test.ts, daemon.test.ts („own local project“), harness-local.test.ts,
add-project.test.ts, fake-auto.test.ts (gate-github), contract local-control.test.ts, cli local-control.test.ts, web
keys.test.ts (postProject), e2e local-access (браузърът).
Ограничение: огледалото не следи новите комити в папката сама — одобрените промени влизат в main на огледалото, а в
папката се взимат с „Приложи локално“ (десктоп) или `git pull <огледалото> main`. Синхронизация от папката → огледалото е
отделна стъпка, ако потрябва.
Не е проверено на живо: добавяне на истински проект в пуснат `pnpm local` и първа задача в него.
Статус: решено.

## D-389 Docker тестовете на Mac с Colima; по-бърз строеж на образите; `pnpm local` на двата езика (25.10.2026)
Решение:
(1) Причина за падащите Docker тестове на този Mac: Docker е Colima (контекст `colima`, vmType vz, mountType virtiofs,
Colima 0.10.3), който споделя с виртуалната машина само `$HOME` — в `~/.colima/default/colima.yaml`: „Colima default
behaviour: $HOME is mounted as writable“, `mounts: []` (проверено на живо на 25.10.2026 с `docker run -v`: папка от
`/Users/…` се вижда, от `/var/folders/…`, `/private/var/…` и `/tmp` — празна; https://github.com/abiosoft/colima). Тестовете
правят папките на пясъчника с `os.tmpdir()` (`/var/folders/…`), така че мрежовият филтър получаваше празна папка с
правила и никога не пишеше `policy_loaded`. Истинските пускания не са засегнати: `pnpm local` държи всичко в
`<repo>/.mandat` (под `$HOME`). Поправка: `vitest.docker.config.ts` дава на Docker тестовете `TMPDIR=<repo>/.mandat/tmp-docker`
(или `MANDAT_DOCKER_TMP`); `.mandat/` е в `.gitignore` и `.dockerignore`.
(2) Строеж на образите: `COPY . .` + `pnpm install` за целия workspace теглеше всичко наново при всяка промяна в кода
(18,5 мин за образа на филтъра). Сега: кеш на pnpm хранилището между строежите (`RUN --mount=type=cache,id=mandat-pnpm-store`)
и инсталиране само на нужните пакети (`--filter "<пакет>..."`, както пясъчникът вече правеше) в egress-gate, llm-proxy и
worker; `.dockerignore` изключва `**/.next`, `apps/site/out`, `apps/site/public/downloads`, `**/test-results` (~770 MB,
които никой образ не ползва).
(3) `pnpm local` пише на езика на човека (MANDAT_LANG / системния език): банерът, проверките, стъпките [n/4] — каталогът на
CLI; десктопът намира адреса и грешките и на двата езика. Банерът вече казва „Настройки → Акаунти → Влез с Claude“.
(4) Дребни: в списъка на SQL тестовете липсваше `diff_omitted.test.sql` (от D-385); типовете на два теста от D-388.
Тестове: scripts/docker-tmp.test.ts (TMPDIR, .dockerignore), local.test.ts (двата езика), test-db.test.ts.
Бележка за нощни пускания: Mac-ът спи (DarkWake на ~16 мин за 45 s) и дългите Docker тестове изтичат; пускай ги с
`caffeinate -i pnpm test:docker` или с отворен капак на захранване.
(5) Трите теста с истински Postgres (db, conflict-wait, night-park) се свързват през публикуван порт на 127.0.0.1
(`pg-container.test-helper.ts`): IP-то на контейнер не се вижда от Mac. `conflict-wait` проверява поведението след D-367
(първата задача влиза в main сама; втората, същата промяна, е празна → HELD empty_change).
Резултат (25.10.2026, буден Mac): `pnpm test:docker` 61 минали / 0 паднали (1 пропуснат), bench 40/40 и 0 лъжливо VERIFIED,
red team 10/10, D12 с UI образа; `pnpm check` CHECK OK; e2e 35/35. Отчет: docs/reports/night-2026-10-25.md.
Статус: решено.

## D-390 Нощен режим: какво остава за решение на Симо и какво избрах по подразбиране (25.10.2026)
Решение: в нощния режим („свърши цялата работа без да чакаш одобрение, само без комити“) трите отворени въпроса от
docs/reports/ui-ux-simplify.md остават с най-безопасния избор, без код, който трудно се връща:
(1) UNKNOWN не се одобрява ръчно — остава „Пусни отново“ / „Върни с бележка“ (по-строгото; D-386).
(2) Фаза 4 (изтриване на Проучване, Агенти, Нощна смяна, Дъска, Документи, `mandat tui`, терминала в десктопа) не е
направена: страниците са скрити от менюто (D-384) и се отварят само по линк; изтриването е необратимо като продуктово
решение и чака „да“.
(3) Правилата на нов проект не се одобряват сами — сканирането ги предлага, собственикът одобрява (D-388).
Статус: по подразбиране до отговор.

## D-391 Иконата в Dock-а при пускане от кода (25.10.2026)
Решение: `pnpm desktop` (без пакет) на macOS е `Electron.app` и Dock-ът показва иконата на Electron — опцията `icon` на
BrowserWindow не се ползва за Dock-а в macOS. Затова при `!packaged` на macOS десктопът задава `app.dock.setIcon(...)` с
`apps/web/public/icon-512.png` (`HarnessLayout.dockIcon`; https://www.electronjs.org/docs/latest/api/dock, 25.10.2026).
Инсталираният `.dmg` не се пипа: иконата му идва от пакета (`electron-builder.config.mjs` → icon-512, D-382/D-383).
Тестове: harness-launch.test.ts (dockIcon само за macOS от кода).
Статус: решено.

## D-392 Скриптовете вървят и под Windows: `shellEmulator: true` в pnpm-workspace.yaml (22.10.2026)
Решение: pnpm пуска всички package.json скриптове през собствената си POSIX обвивка, не през cmd. Така
`NEXT_TELEMETRY_DISABLED=1 next build|dev|start` в apps/web работи и в PowerShell/cmd, без cross-env и без нова зависимост.
Тест: scripts/scripts.test.ts („скриптовете с `VAR=…` вървят и под Windows“) намира скриптовете с `VAR=…` отпред и проверява,
че `pnpm config get shell-emulator` дава `true`.
Проверено: тестът е червен без настройката и зелен с нея; `pnpm build` в PowerShell на Windows 11 минава (преди: „'NEXT_TELEMETRY_DISABLED'
is not recognized“ в @mandat/web). Емулаторът важи и под Linux/WSL; там CI (`pnpm check`) е проверката.
Не е проверено: под Windows останалата част от `pnpm local` (Docker, пясъчникът) и `pnpm gitleaks` (`"$PWD"`); README
все още препоръчва WSL.
Допълнение (22.10.2026): `pnpm local` стигна до [4/4] под Windows и падна на `spawn pnpm ENOENT` (там pnpm е pnpm.cmd).
`mandat local` вече пуска уеб сървъра с `node <next>/dist/bin/next start -p 3000` в apps/web (webStartSpawn), без pnpm и
без shell: работи на всяка ОС и Ctrl+C спира самия сървър (през shell kill() би спрял cmd.exe, а сървърът би държал порта).
Тест: local.test.ts. Десктопът (`pnpm desktop`) падаше по същия начин: сега пуска `pnpm local` с pnpm-а, който го е
стартирал (npm_execpath; под Windows pnpm.exe, проверено в PowerShell), а „Спри и излез“ под Windows спира цялото дърво с
`taskkill /pid … /T /F` (сигнал там спира само pnpm и сървърът остава на порта). Тест: apps/desktop/src/banner.test.ts.
Не е проверено в самия прозорец (Electron) под Windows. Остава под Windows (без промяна): `mandat doctor`
вика `pnpm -v` без shell; 5 CLI теста падат под Windows и преди тази промяна (verify-log, pnpm --silent, proxy ×2, WSL DrvFs).
Защо: Симо, 22.10.2026 — `pnpm local` падна на Windows; „направи поправката за Windows постоянна в хранилището“.
Алтернативи: cross-env в apps/web (нова зависимост, правило 8); WSL за всички (у Симо няма Linux дистрибуция).
Източник: https://pnpm.io/settings#shellemulator (22.10.2026), проверено с pnpm 12.14.0. Статус: решено.
Номер: първоначално D-309 в клона new-session; при сливането с exciting-heisenberg (25.10.2026) номерът беше зает, затова D-367; при второто сливане (25.10.2026, PR #1) и D-367 беше заето, затова D-392.
Допълнение (25.10.2026, сливане с PR #1): новият десктоп (D-376) пуска CLI-я направо с Node-а на Electron и уебът тръгва с node + next (D-376), затова localSpawn и webStartSpawn отпаднаха. Остана само спирането на цялото дърво под Windows (stopCommand в apps/desktop/src/banner.ts).
## D-400 Паметта на Мандат: стеснен PRD-9, нива на доверие (26.10.2026)
Номер: в комитите на клона phase/e9m-memory тези решения са D-392–D-395; преномерирани на D-400–D-403 при сливането,
защото клонът phase/e9d-research вече ползва D-392–D-395 за връзките (26.10.2026).
Решение: Симо одобри дизайна от docs/prd/research/memory.md („Да започни цялото, всички фази“, 26.10.2026). PRD-9 се
стеснява: **правилата и правата** остават само с одобрение (профил, предложения, 6.11); **фактите и предпочитанията** са
памет със запис по ниво на доверие на източника:
човек (меню, „запомни:“ в задача) → активно; агент в сесия с основание „ти каза“ → активно със значка и отмяна;
агент с основание „видях“ (файлове, уеб, MCP, изход на инструмент) и агент в пясъчника → чака одобрение;
текст, който прилича на правило или право → не става памет (причина `rule`, човекът го прави през „Правила“).
Всеки запис минава скенер: невидим Unicode, тайни (@mandat/redaction), prompt injection/exfil шаблони.
Остарял факт не се трие: получава `invalid_at` и `superseded_by` (Graphiti; arXiv 2609.05441 — обновяване при запис).
Агентът в пясъчника вижда само `memory_block` в договора (замразено ядро + извадка за задачата), никога базата;
хешът на блока е `memory_hash` на договора и `memory_snapshot` в дневника (D-022 се сменя).
Защо: изследванията (Hermes, Mem0, Zep, OWASP ASI06) — контролът е при записа, с произход; малко замразено ядро пести
токени и пази prefix кеша; човекът вижда и поправя всичко.
Статус: решено.

## D-401 Търсенето в паметта: думи + същности, без вектори засега (26.10.2026)
Решение: извличането е хибрид в кода (BM25 върху корени на думите bg/en + съвпадение по същности + употреба като
второстепенно, слети с Reciprocal Rank Fusion) върху активната памет на човека и проекта; без pgvector и без модел за
ембединги. Порталът е златният набор `packages/memory/src/eval.ts` (23 въпроса: директни, друга форма на думата,
същност, обновен факт, въздържане): recall@5 ≥ 0,9, обновените факти и въздържането 100% — днес минава изцяло.
Ако промяна го свали под прага или реална употреба покаже пропуски по смисъл → спайк с pgvector (PGlite има разширение
[НП]) вместо донастройка на думите.
Защо: arXiv 2609.05441 — ембедингите са ненадеждни за обновени факти, а склад с обновяване при запис държи 0,70–1,00;
без нова зависимост, без изтегляне на модел, $0 на заявка; паметта на един човек е стотици записи, не милиони.
Статус: решено (преразглежда се по златния набор).

## D-402 MCP сървър на паметта за собствените сесии (26.10.2026)
Решение: `packages/memory` дава bin `mandat-memory-mcp` (stdio). При старт изчислява ядрото и го праща като `instructions`
на сървъра — замразено за сесията (като Hermes; prefix кешът остава). Инструменти: `memory_search`, `memory_note`
(user_said → активно; observed → чака; session → само в процеса), `memory_core`. Базата е тази на `pnpm local`
(MANDAT_DB_URL я сменя), човекът е единственият собственик или `--user`, проектът е `--repo`. Ключове на доставчици в
средата → отказ (S35). Сървърът `mandat` (Apache-2.0, ядро) не се пипа: той няма достъп до базата по дизайн.
Свързване: docs/setup/memory.md (`claude mcp add … -- node …/main.js --repo …`, https://code.claude.com/docs/en/mcp, 26.10.2026).
Статус: решено; на живо с истински Claude Code чака Симо.

## D-403 „Памет“ е четвърти раздел в страничното меню (26.10.2026)
Решение: страничната лента има четири раздела — Задачи, Проекти, **Памет**, Настройки (D-384 беше три). Симо поиска
паметта „отстрани в менюто“ (26.10.2026). Страницата `/memory`: списък и изглед „Връзки“ (граф: ти и проектите като
шестоъгълници, спомените като точки по статус, общите теми като квадрати; детерминистична радиална подредба, SVG от
сървъра, без нова зависимост), търсене (същото извличане като на агента), филтри (за теб, проекти, чака теб, архив),
страничен панел с произход, история, редакция, одобрение/отказ, закачане в ядрото, архив, изтриване; „Подреди“
(консолидация); отгоре цената в токени (ядро, цялата памет, средно на задача и спестеното). Десктопът: „Изглед → Памет“.
Права: личната памет е само на човека; проектната пишат собственик и одобряващ, четат всички членове.
Статус: решено.
## D-393 Връзки: първо пускане (/welcome), модели, абонаменти, ключове и локални модели (26.10.2026)
Номер: шестте първи комита на клона са с етикет „D-392“; паралелната сесия за паметта зае D-392 в същия ден, затова
решението е D-393 (комитите не са пренаписани: клонът phase/e9d-research-engine вече е построен върху тях).
Решение:
(1) Едно понятие „връзка“ (packages/contract/src/connections.ts): начин да стигнеш до модел — абонамент (непроменен CLI
със собствен вход, D-295), API ключ, сървър на този компютър или друг адрес, който говори Anthropic Messages API
(Claude Code) или OpenAI Responses API (Codex). Каталог `PROVIDERS` с адрес, вид удостоверяване, страница за ключ,
документация, дата на проверка и предложени модели (най-способен/балансиран/бърз, един „препоръчан“). Агентът на задача:
`claude` | `codex` (ключа на доставчика), `claude@<акаунт>` | `codex@<акаунт>` (абонамент), `claude+<връзка>` |
`codex+<връзка>` (записана връзка); `tasks.model` пази избрания модел (null = подразбиращия се на връзката).
(2) Сигурност — същият модел като досега: агентът в пясъчника получава само mdt_ токен; токенът назовава една връзка
(claim `u`), проксито държи ключа ѝ, адреса ѝ, начина на удостоверяване и списъка позволени модели (модел извън списъка →
403). Ключовете са в keys.sealed.json (AES-GCM, KEK в keychain, E7в) под `conn:<id>`; метаданните — в
$MANDAT_HOME/connections.json (0600); уебът и работникът никога не виждат ключ. Ключът се проверява веднъж от CLI-то
(`GET <адрес>/v1/models`; без такъв път — едно съобщение с max_tokens 1) и не се връща в отговор. Адрес: само https към
име (без IP литерал, без потребител, query или fragment) или http към този компютър, който проксито вижда като
`host.docker.internal` (`--add-host host.docker.internal:host-gateway` само на проксито, никога на пясъчника).
(3) Модели: за записана връзка Claude Code ползва избрания модел за всички нива и подагенти (`ANTHROPIC_DEFAULT_*_MODEL`,
`CLAUDE_CODE_SUBAGENT_MODEL` — по документацията на Kimi, иначе Claude Code иска Claude имена, които доставчикът няма).
Цени: от каталога; локален модел — 0; непозната цена — оценка по цената на Sonnet, за да спира бюджетът. Ключът на
Anthropic вече пуска Opus 5.5 и Fable 5.1 (цени от claude-api skill, кеш 06.10.2026: $4/$20 и $10/$50 на MTok).
(4) Локален модел (Ollama, LM Studio): работи през Claude Code и проксито (Ollama говори Anthropic Messages API от
01.2026); задача на локален модел не вдига стълбата над ниво 1 (спец. 5.3; `tasks.channel_kind`, `ladderStepFor` cap).
(5) ChatGPT абонамент: `codex login --device-auth` в контейнер с CODEX_HOME на собствен volume
(`mandat-profile-codex-<име>` → /home/agent/.codex-profile); уебът показва страницата на OpenAI и еднократния код, нищо не
се връща към процеса. В задача Codex ползва собствения си доставчик и входа (без `model_provider="mandat"`), а изходът е
само CONNECT тунелът на вратата към chatgpt.com, auth.openai.com, api.openai.com [НП: точните хостове и текстът на
`codex login --device-auth`/`login status` — спайк на живо].
(6) Уеб: `/welcome` се отваря сам, докато нищо не може да пусне задача и първото пускане не е завършено: (а) какво имаш
(абонаменти, ключове, на този компютър — Ollama/LM Studio се откриват сами с моделите си), (б) свързване на място
(вход, ключ с проверка, избор на модели), (в) агент и модел по подразбиране. „Настройки → Модели“ (/settings/models):
моделите на всяка връзка, махане, подразбиращото се, „Добави връзка“. Полето за задача: агент + модел, запомненото
първо. Права: `accounts.manage` + Origin + CSRF; контролната точка на `pnpm local` (127.0.0.1 + токен).
Как го правят други харнеси (26.10.2026): OpenCode — `opencode auth login`, доставчици от models.dev, данните централно
(https://opencode.ai/docs/cli); Codex — вход с ChatGPT или device code, `~/.codex/auth.json` или keychain
(https://developers.openai.com/codex/auth); Goose — env → keychain → файл 0600; Cline — абонамент, BYOK или локален
модел с откриване на моделите (https://docs.cline.bot/running-models-locally/ollama). Ollama Anthropic API:
https://docs.ollama.com/api/anthropic-compatibility; DeepSeek: https://api-docs.deepseek.com/guides/anthropic_api
(x-api-key; `deepseek-v4-pro`, `deepseek-flash`); Kimi Code: https://www.kimi.com/code/docs/en/third-party-tools/claude-code.html
(`https://api.kimi.ai/coding/`, `k3.1-pro`); Z.ai: https://docs.z.ai/scenario-example/develop-tools/claude (Bearer;
[НП: имена на моделите]).
Тестове: contract connections.test.ts; llm-proxy proxy-upstreams.test.ts, connections-store.test.ts; sandbox
connections.test.ts; channels connection-channel.test.ts; agents codex.test.ts; verify sandbox-exec.test.ts; worker
agent-route.test.ts, daemon (spill с новия маршрут); core external-ladder-key.test.ts; cli connections.test.ts,
login-session.test.ts, local-control.test.ts, proxy-keys.test.ts, accounts.test.ts; web connections-api.test.ts,
agents.test.ts, login-view.test.ts, connections-ui.test.ts. Проверка в браузъра с stub на контролната точка и отделна
база: /welcome → вход с Claude (код) → DeepSeek (отказан и приет ключ) → ChatGPT (device код) → подразбиращо се →
полето за задача тръгва с него → задача с `claude@lichno` + `claude-opus-5-5` в tasks; намерени и оправени 5 неща
(инсталираните модели на Ollama вместо каталожното име, текстовете за ChatGPT, един вход на панел, етикети).
Не е проверено на живо: истинска задача през DeepSeek/Kimi/Z.ai/Ollama, ChatGPT вход и задача с Codex,
`host-gateway` под Colima [НП] (чеклист 30–32).
Статус: решено (живите части чакат Симо).
## D-404 Ресърчът ползва всеки вързан модел; ролите по модели се избират по цел (26.10.2026)
Решение (Симо, 26.10.2026: „системата трябва да може да ползва всички — абонаменти, API, локални“): ресърчът (E9г,
`packages/research`) вика модел през един интерфейс `ModelClient` с три вида канал: API ключ през llm-proxy с mdt_ токен,
ограничен до рънa и бюджета му (`proxyModel`, официалният `@anthropic-ai/sdk` срещу проксито — ключът остава в проксито,
правило 2); абонамент — непромененият `claude -p` без инструменти в контейнера на профила (`cliModel`, D-410); локален
сървър с OpenAI-съвместим `/chat/completions` (Ollama, LM Studio, vLLM; `localModel`). Седем роли (`RESEARCH_ROLES` в
contract): planner, searcher, triage, reader, analyst, verifier, writer. `routeRoles` (чиста функция) подрежда каналите за
всяка роля по резултата на избора на канал (0,5·Q + 0,3·(1−C) + 0,2·H, packages/channels) с теглата на Q/C, преместени по
роля и цел (economy / balanced / quality): планирането и писането плащат за качество, ролите „на страница“ (заявки, подбор,
четене) — за цена; абонаментът е бавен на повикване (стартира CLI) и затова губи 0,15 за ролите на страница. Всеки
следващ канал е резервен (грешка/429 → следващият; всеки опит е събитие `model_call`). Човекът може да фиксира канал за
роля (`routing`). Усилието (`output_config.effort`) е по роля: четене/заявки low, анализ medium, план/писане high.
Защо: докладът docs/prd/research/research-strategies.md §7.2 (Anthropic multi-agent research, open_deep_research, STORM,
GPT-Researcher, Jina) — качеството идва от модела на плана и синтеза, обемът (токените) от четенето; евтин модел там с
проверка на цитата като подниз пази качеството.
Тестове: router.test.ts, model.test.ts, research-host.test.ts.
Статус: решено.

## D-405 Стълбата за четене: HTTP → браузър → архив → доставчик; без заобикаляне на защити (26.10.2026)
Решение: страница се чете през `Fetcher` (packages/research/src/fetch): (1) HTTP с проверка срещу SSRF на всеки скок
(`checkUrl`: само http(s), без потребител:парола, портове 80/443/8080/8443, без вътрешни имена) и закачен адрес
(собствен `lookup` пропуска само публични адреси — DNS rebinding не минава), ≤ 5 редиректа, 5 MB, 20 s, gzip/br;
извличане на основния текст с Mozilla Readability върху linkedom, PDF с unpdf; (2) истински Chromium (Playwright образът на
D12, `docker/sandbox-ui`) само за JS страници или твърде тънки (<300 знака) — един контейнер на страница с флаговете на
SANDBOX_HARDENING (`buildRenderArgs`), мрежа mandat-upstream и прокси пазач вътре в контейнера, който сам резолвира и
отказва всеки непубличен адрес; WebRTC само през проксито; без картинки, шрифтове, медия и бисквитки; (3) копието на
Wayback Machine (`archive.org/wayback/available` → `web/<ts>id_/<url>`), когато сайтът отказва или е паднал; (4) доставчик
за извличане (Exa contents, D-411). robots.txt (RFC 9309) се спазва по подразбиране; ≤ 2 заявки едновременно на сайт и
пауза между тях (crawl-delay до 5 s). Стена срещу ботове или CAPTCHA (403/429/503, „Just a moment…“, cf-chl, datadome…) не
се решава и не се заобикаля: източникът е „blocked“, стълбата минава към копие или друг източник (Симо искаше „минава лесно
защитени сайтове“ — това е законният начин: истински браузър за JS, архив, доставчици, които сами имат право; без
фалшиви отпечатъци и решаване на CAPTCHA).
Флагове на Playwright/Chromium: `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` [НП → спайк на живо с UI образа].
Тестове: ssrf.test.ts, http.test.ts, robots.test.ts, extract.test.ts, fetcher.test.ts, browser.test.ts.
Статус: решено; браузърното ниво на живо — при `pnpm mandat images build --ui`.

## D-406 Бюджетите по дълбочина: таван, не цел; с таван на токените (26.10.2026)
Решение: `depthBudget` в contract — quick $0,25 / 1 лента / 8 страници / 6 заявки / 1 кръг / 150k токена / 2 мин; standard
$1 / 3 / 30 / 24 / 2 / 1M / 8 мин; deep $8 / 8 / 120 / 80 / 4 / 4M / 25 мин. Заменя $0,10/$0,50/$2,00 на D-359: при тях
стандартът нямаше място за кръг за празнините (докладът research-strategies.md §7.3 изчислява $0,50–1,50 за стандарт).
Таванът на токените брои и абонаментите и локалните модели ($0, но не 0 токена). 20% от парите остават за писателя, така
че спрян рън пак завършва с доклад „непълно: бюджет“ (AC-13.7). Човекът задава свой бюджет в заявката.
Тестове: research-run.test.ts, budget.test.ts, engine.test.ts (AC-13.7).
Статус: решено; калибриране по 10 златни въпроса × 3 дълбочини на живо (research-strategies.md §7.7).

## D-407 Собствено търсене: SearXNG на 127.0.0.1 + отворените API; платените са добавка (26.10.2026)
Решение (Симо: „искам къстъм процес, не да ползваме MCP-та; ще я има и тази опция“): ресърчът търси със собствен механизъм
— SearXNG (метатърсачка, AGPL-3.0, отделен контейнер, не се линква) `searxng/searxng:2026.10.19-81371861f@sha256:5ed0323b…`
(Docker Hub, тагът и digest-ът прочетени 26.10.2026; публикуван 19.10.2026, ≥ 3 дни), публикуван само на 127.0.0.1:8888,
`--cap-drop=ALL`, настройките само за четене (`docker/searxng/settings.yml`: JSON изход, без limiter), тайната по име
(SEARXNG_SECRET), `GRANIAN_HOST=0.0.0.0` (иначе слуша само на IPv6 и Colima не я препраща — проверено на живо). Команда
`pnpm mandat research engine start|stop|status`. Плюс отворените API: Wikipedia (MediaWiki search), arXiv (Atom), Crossref
(само с MANDAT_RESEARCH_MAILTO, polite pool), GitHub (repositories), Stack Exchange. Платени, когато са вързани: Anthropic
web search през проксито (`web_search_20250305` за Haiku, `web_search_20260209` за Sonnet/Opus — claude-api skill,
26.10.2026), Exa (D-411). Резултатите се сливат с reciprocal rank fusion (k = 60) + BM25 на заглавие+откъс спрямо въпроса на
лентата, канонични URL (без utm/fbclid/gclid, без www, сортирана заявка), ≤ 2 страници на сайт. Ако всички двигатели на
SearXNG изтекат — един нов опит.
Проверено на живо (26.10.2026): „RFC 8785 JSON canonicalization“ → 41 резултата (brave, google cse, duckduckgo — DDG понякога
връща CAPTCHA, тогава останалите стигат); рън с истински страници: 10 източника, 29 точни цитата за 16 s, robots.txt спрян
reddit/facebook, npmjs → 403 стена → „blocked“. API параметрите на Wikipedia/arXiv/Crossref/GitHub/Stack Exchange са от
паметта [НП → спайк RS на живо].
Тестове: providers.test.ts (записани отговори), rank.test.ts, sandbox.test.ts (buildSearxngArgs), research.test.ts в cli.
Статус: решено.

## D-408 Докладът: един самостоятелен HTML, Markdown и JSON (26.10.2026)
Решение: `reportHtml` прави един файл без мрежа и без скриптове: отговорът с цитати [n] (при посочване се вижда точният
цитат, домейнът и датата), секциите, таблица на твърденията с присъда и цитатите им, непровереното и противоречията,
източниците с краен URL, хеш (SHA-256 на прочетения текст) и ниво на четене, „Как беше направен“: стратегия и ленти,
карта на процеса (SVG: въпрос → ленти → заявки → източници → твърдения), времева линия (SVG по ленти: модел / търсене /
четене), модели по роли с повиквания, токени и $, четене по нива, пълният дневник и данните като JSON
(`<script type="application/json">`, `<` екраниран). Тъмна и светла тема, печат към PDF. `reportMarkdown` — същото като
текст. Уебът ги сваля с CSP `default-src 'none'; style-src 'unsafe-inline'`. Думите следват езика на въпроса (кирилица → bg).
Тестове: report.test.ts (екраниране на враждебно заглавие, без скриптове, JSON се парсва), research.test.ts в web.
Статус: решено.

## D-409 Ресърч от уеба: опашка, събития на живо, панел вдясно, „Проучване“ в менюто (26.10.2026)
Решение: миграция `20261026000040_research_runs.sql`: `research_questions` получава заявката (JSON), дълбочина, цел, кой
пита (human / agent / task), heartbeat, stop_requested, разход, partial, грешка, доклада (JSON ≤ 8 MB); нова
`research_events` (seq, at, lane, kind, data ≤ 64 KB, само четене за членовете, RLS); `research_sources/claims` с хеш,
ниво, лента, дата. Работникът (`runResearchOnce`, `researchLoop` в `mandat worker`/`pnpm local`, MANDAT_RESEARCH=0 го
спира) взема най-старата заявка с ≤ 2 текущи на организация (SKIP LOCKED), записва всяко събитие веднага, проверява Stop
на 2 s, пише източници, твърдения и доклада; рън без heartbeat 2 мин → failed. Уебът: `POST /api/research` (право
research.ask, бюджетът и каналите се проверяват), `/stop`, `/stream` (SSE с Last-Event-ID = seq), `/report?format=html|md|json`.
Страницата /research: въпросите вляво; форма (въпрос, дълбочина, модели по цел, „Още настройки“: указания, модел за всяка
от седемте роли, къде да търси, сайтове само/никога, колко скорошно, бюджет, robots.txt); живият изглед — в центъра планът,
намереното досега, после отговорът, твърденията и източниците; вдясно „Активност“: фазите (План → Търсене → Четене →
Проверка → Писане), броячи, бюджет, всяка лента и какво прави сега, моделите с повиквания и $, всяка стъпка. „Проучване“
става четвърти раздел в страничното меню (D-384 имаше три; Симо иска ресърчът да се вижда). CLI: `mandat research ask`
(опашка + живият поток в терминала + доклад), `mandat research demo` (записаният свят без ключ и мрежа).
Тестове: research_runs.test.sql (pgTAP), research.test.ts (worker, web, cli), research-view.test.ts, nav.test.ts.
Статус: решено.

## D-410 Проксито на 127.0.0.1 и за ресърча; абонаментът отговаря с `claude -p` без инструменти (26.10.2026)
Решение: ресърчът върви в работника на този компютър, а проксито публикуваше само админ порта. `buildProxyRunArgs` вече
може да публикува и порта за инференция на 127.0.0.1 (`publishInferencePort`, само за `mandat-llm-proxy`, никога същия като
админ порта; по подразбиране админ − 1 = 8787, `MANDAT_PROXY_INFERENCE_PORT`). Без mdt_ токен портът отказва (както в
пясъчника). Абонамент: `buildProfileArgs("print", argv)` пуска непроменения CLI на профила с `claude -p --output-format
json --tools "" --strict-mcp-config --no-session-persistence --model … --system-prompt …`, промптът по stdin, мрежата е
пътят на профила до доставчика (както при вход); всяко друго argv (инструменти, MCP, `--dangerously…`) е отказ. stderr не се
чете (може да цитира промпта). Флаговете: `claude --help` на 2.1.198 (26.10.2026; `--tools ""` = без инструменти).
Тестове: sandbox.test.ts, research.test.ts (cli), research-host.test.ts.
Статус: решено.

## D-411 Exa зад проксито (26.10.2026)
Решение: платените доставчици на търсене се викат като модел — с mdt_ токен, ключът е само в проксито (правило 2). Проксито
има `POST /research/exa/search` и `/research/exa/contents` → `https://api.exa.ai/{search,contents}` с `x-api-key`; същата
проверка на токена, отмяна и бюджет; всяко повикване има цена ($0,007 за търсене до 10 резултата + $0,001 за всеки
следващ; $0,001 на страница за contents — research-tools.md [НП]) и влиза в `usd` на рън-а; в дневника на проксито няма
тяло и ключ. Ключът: `EXA_API_KEY=… pnpm mandat proxy start` (запечатва се като `research:exa`) или в boot payload
`{"search":{"exa":"…"}}`; healthz казва само „exa“. Ресърчът включва Exa (търсене + последна стъпка на стълбата за четене),
когато проксито го държи.
Тестове: proxy-search.test.ts, providers.test.ts, research-host.test.ts.
Статус: решено; полето за ключа в „Ключове“ в UI — следваща стъпка (засега през CLI).

## D-412 MCP сървър `research` и вграденото умение `research` (26.10.2026)
Решение: `packages/research-mcp` (`mandat-research-mcp`, stdio) дава седемте инструмента от договора (v5 2.5):
research_search, research_read, research_docs, research_code, research_ask, research_verify, research_recall. Сесията пази
всеки URL, излязъл от резултат на инструмент; research_read/verify приемат само тях (AC-13.3: измислен URL → отказ с
причина). Текстът на страница идва в `<untrusted>`. research_verify: цитат, който е в два независими сайта → confirmed, в
един → single, не е в източника → quote_missing, без цитат → unchecked (AC-13.5). research_ask слага рън в опашката като
„agent“ и чака до 4 мин; research_recall намира завършени рънове на проекта по думите на въпроса (AC-13.9). Вграденото
умение `research` (packages/profile/src/research-skill.ts) описва целия процес — кога, Recall → План → Търсене → Четене →
Дословен цитат → Празнини → Проверка → Писане — и правилата (URL само от инструмент, страниците са данни, нищо „по памет“).
За агент на този компютър: `claude mcp add research -- node packages/research-mcp/dist/main.js` (с MANDAT_DB_URL за
ask/recall). Материализацията в пясъчника (път през egress-gate до сайдкар) чака бриджа на E8д.
Тестове: research-mcp.test.ts (AC-13.1 с истински MCP клиент), builtin-skills.test.ts.
Статус: решено; пясъчникът — следваща стъпка.

## D-413 fast-sha256 (Unlicense) през официалния Anthropic SDK (26.10.2026)
Решение: `@anthropic-ai/sdk` 1.1.0 (Apache-2.0; 1.2.0/1.3.0 са по-млади от 3 дни) тегли `standardwebhooks` → `fast-sha256`
1.3.0 (Unlicense — посвещение на обществено достояние). Unlicense беше позволен само за dev (D-052); добавен е като
prodException само за този пакет в harness групата (както caniuse-lite D-284, argparse D-376). Алтернатива: обратно към
суров HTTP към проксито — отхвърлена, защото claude-api указва официалния SDK за TypeScript.
Статус: решено от кодера; Симо може да го обърне.

## D-414 Коренът на хранилището през `fileURLToPath` (29.10.2026)
Решение: `defaultRepoRoot` в `apps/worker/src/run.ts` и `packages/verify/src/cli.ts` се смята с
`fileURLToPath(import.meta.url)`, както `packages/cli/src/paths.ts`. `new URL(import.meta.url).pathname` дава `/C:/…`
на Windows и `path.resolve` го правеше `C:\C:\…`; worker-ът падаше с ENOENT при първата задача (`imageTags`).
Тест: `repo-root.test.ts` в двата пакета.
Статус: решено от кодера; Симо може да го обърне.

## D-415 Проверката на bind mount-овете сравнява в posix вид (29.10.2026)
Решение: `checkBind` (`packages/sandbox/src/hardening.ts`) превръща `src` и `runDir` в posix вид (`\` → `/`) преди
regex-ите за `gate/policy`, `gate/log` и `etc/{resolv.conf,hosts}`. На Windows `path.resolve` дава `\` и всеки
mount на gate-а се отхвърляше (D-118) → `E_GATE_START` на всяка задача. Правилата не са разширени: на Windows `/` и `\`
са един и същ разделител. Тестовете за mount-овете в `sandbox.test.ts` минават и на Windows; три snapshot-а остават
червени там, защото очакват POSIX пътища (`/home/simo/...`).
Статус: решено от кодера; Симо може да го обърне.

## D-416 Infra потребителят на Windows е 1000:1000 (29.10.2026)
Решение: `infraUser` (`packages/sandbox/src/docker.ts`) връща `1000:1000`, когато uid или gid са отрицателни. На Windows
`os.userInfo()` дава `-1/-1`; `"-1:-1"` се отхвърляше от `buildRunArgs` („invalid user“) → `E_GATE_START` на всяка задача.
Docker Desktop сам превежда правата по bind mount-овете, затова потребителят по подразбиране на образите (1000) стига;
същата стойност ползва и резервът в `runTask`. Rootless остава `0:0`. Тест: `sandbox.test.ts` (D-034).
Статус: решено от кодера; Симо може да го обърне.

## D-420 Роли по модел: `routing_rules.role` и `selectChannelForRole` (28.10.2026)
Решение: (спец. 5.3) всяко правило в routing_rules е за една роля на задачата — lead | subagent | research | review | summary
(същите роли като слой H на профила, `ModelRole` в packages/contract/src/profile.ts; не са дублирани). Схемата на реда е
`ChannelRule` (packages/contract/src/routing.ts) с `ruleForRole`: правилото на ролята, иначе правилото на lead, иначе auto —
едно правило стига за всички роли. packages/channels `selectChannelForRole` избира по това правило и записва ролята в
`channel_reason.role`. Миграция 20261028000420_routing_role.sql: колона `role` (по подразбиране lead, check). Работникът:
`ruleFor(db, org, repo, type, role = "lead")`. Каналът `local` вече е кандидат в автоматичния избор (без дневен бюджет —
цената му е 0); `cli_profile` остава извън оценявания избор (абонаментът идва от агента, D-295).
Не е направено: UI за правило по роля (Настройки → Модели) и ползване на review/summary/subagent в работника — review
съветникът (E9б) още вика своя stub/канал; ресърчът има свои роли (D-404) и не е пипан (друга сесия). Q-070.
Тестове: contract routing.test.ts, channels select-role.test.ts, worker channels-role.test.ts (PGlite с миграцията).
Статус: решено.

## D-421 `ladderCapFor` знае вида на канала: local → ниво 1 (28.10.2026)
Решение: спец. 5.3 казва „ниво ≤ 1 (ladderCapFor)“. D-392 таваните идваха от извикващия (`cap: 1`); сега
`ladderCapFor(agent, kind?)` връща 1 за `kind === "local"` (и за external:*), а `ladderStepFor(..., { kind })` го ползва.
finishOutcome в daemon.ts подава `kind` от `tasks.channel_kind`.
Тестове: core external-ladder-key.test.ts.
Статус: решено.

## D-422 Локален канал през проксито: `MANDAT_UPSTREAM_LOCAL_<label>`, $0, спиране при `agent:no_tools` (28.10.2026)
Решение: (спец. 5.3, AC-3.6) освен записаните връзки на Ollama/LM Studio (D-393) проксито приема локални сървъри от env:
`MANDAT_UPSTREAM_LOCAL_<LABEL>=<адрес>` → upstream `local-<label>` (малки букви, `_` → `-`), задължително
`MANDAT_UPSTREAM_LOCAL_<LABEL>_MODELS=<id>,<id>` (проксито пази списък позволени модели) и по избор
`MANDAT_UPSTREAM_LOCAL_<LABEL>_WIRE=anthropic|openai` (по подразбиране anthropic; Codex иска Responses API → vLLM [НП]).
Адресът минава през същото правило като връзките (`upstreamUrl`: http/https към този компютър → host.docker.internal или
https към име; IP литерал в LAN → отказ, Q-071). Без ключ, цена 0, токените се броят. `mandat proxy start` подава тези
имена като публична env на контейнера (адреси, не тайни); стига и без нито един ключ. Каналът в базата е
`local-<label>` с kind local (channelFor → токен с `u = local-<label>`).
Без инструменти: за upstream с `local: true` (env или записана връзка на ollama/lmstudio — `ProxyUpstream.local`) всеки
отговор на заявка, която предлага инструменти (`tools` не е празно), се маркира `tool` / `no_tool` (Messages: блок
`*tool_use`, JSON или SSE `content_block_start`; Responses: елемент `*_call`). `NO_TOOLS_LIMIT = 3` поредни `no_tool` →
`noTools` в usage на рън-а, следващите повиквания → 403 `no_tools` (не се брои като отхвърлен ключ — `refused`).
Заявки без инструменти (заглавия и др.) не се броят; повикан инструмент нулира брояча. Работникът: poll-ът или последното
четене на usage → `stopped: "no_tools"` → причина `agent:no_tools`, без износ (UNKNOWN). Състоянието се възстановява от
usage.jsonl след рестарт (D-116).
Защо в проксито: само то вижда отговорите на модела; агентът (Claude Code) не казва „нямам инструменти“.
Тестове: llm-proxy proxy-local.test.ts (AC-3.6 с фалшив endpoint: $0, токени, 3 без инструмент → no_tools, SSE, boot),
connections-store.test.ts; cli proxy-keys.test.ts; channels connection-channel.test.ts; worker run.test.ts (AC-3.6).
Не е проверено: Docker тест на целия път (иска нов образ на проксито; не е строен в тази сесия — unit тестовете минават
през истинския HTTP сървър на проксито и fake docker на работника) [НП → чеклист 33]; истински Ollama/vLLM.
Статус: решено.

## D-423 Спайк SG: Gemini CLI headless; адаптерът `packages/agents/src/gemini` (28.10.2026)
Прочетено (google-gemini/gemini-cli, main b8fa817, 28.10.2026; същите файлове в v0.65.0 и v0.66.0):
- `-p/--prompt` → headless; stdin се слага пред текста на `-p` (8 MB таван) —
  https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md, …/docs/cli/cli-reference.md (28.10.2026).
- `--output-format text|json|stream-json` (`-o`); stream-json = един JSON на ред: init{session_id, model}, message{role,
  content, delta?}, tool_use{tool_name, tool_id, parameters}, tool_result{tool_id, status, output?, error?},
  error{severity, message}, result{status, error?, stats{total_tokens, input_tokens, output_tokens, cached, input,
  duration_ms, tool_calls, models}}; всички с type и timestamp — packages/core/src/output/types.ts (28.10.2026).
- `--approval-mode default|auto_edit|yolo|plan` (`--yolo` и `--allowed-tools` са остарели → policy engine), `-m`,
  `--skip-trust`, `--policy <файл|папка>`, `--admin-policy` — cli-reference.md, packages/cli/src/config/config.ts (28.10.2026).
- Изходни кодове: 0, 1, 42 (вход), 53 (лимит ходове); в кода още 41 (вход/удостоверяване), 44, 52, 54, 55, 130.
- Настройки: системният файл `GEMINI_CLI_SYSTEM_SETTINGS_PATH` бие всички; `GEMINI_CLI_HOME` за ~/.gemini; GEMINI.md
  (`context.fileName`), `.geminiignore` — docs/reference/configuration.md, docs/cli/gemini-md.md (28.10.2026).
- Policies TOML `[[rule]]` toolName/commandPrefix/commandRegex/argsPattern/decision allow|deny|ask_user/priority 0–999;
  headless: ask_user = deny; `.gemini/policies` в проекта днес не действа (issue #18186) —
  docs/reference/policy-engine.md (28.10.2026).
- Hooks: BeforeTool/AfterTool/… в settings.json, JSON на stdin/stdout, exit 2 = блок — docs/hooks/reference.md (28.10.2026).
- Версия: @google/gemini-cli 0.66.0 (27.10.2026) е по-млада от 3 дни → адаптерът е за 0.65.0 (20.10.2026, Apache-2.0).
Решение: адаптер `geminiAdapter` (argv.ts, stream.ts, to-stream.ts, adapter.ts): argv
`gemini --output-format stream-json --approval-mode yolo --skip-trust -m <модел> -p <задача>`; компилираният слой (напр.
`--policy …`) влиза преди `-p`. yolo, защото в headless всяко „питай“ е отказ, а границата е пясъчникът и вратата.
env: само `GEMINI_API_KEY=<mdt_>`; публична env `GOOGLE_GEMINI_BASE_URL=http://egress-gate`, `GEMINI_CLI_HOME=/m/gemini-home`,
`GEMINI_CLI_SYSTEM_SETTINGS_PATH=/m/in/harness/gemini/settings.json`, `GEMINI_CLI_TRUST_WORKSPACE=true`, `NO_BROWSER=true`.
Системните настройки (`GEMINI_SYSTEM_SETTINGS`): `security.auth.selectedType = "gemini-api-key"` (само с
GOOGLE_GEMINI_BASE_URL CLI-ят избира `gateway` и headless проверката отказва с 41 [НП: на живо]), без статистика (иначе
праща installation id), без обновления и телеметрия, `advanced.ignoreLocalEnv` [НП: точното значение] (правило 4).
Фикстури: fixtures/gemini-jsonl (ръчно писани по типовете и snapshot-а на CLI-я). Живият тест е SKIPPED (D-423).
`pnpm test:counts` вече приема `// D-4xx:` над skip (регексът беше само D-2xx/D-3xx).
[НП]: обикновен `http://` base URL към не-localhost (документацията казва само https, кодът не проверява); точният префикс
на MCP инструментите в потока; къде отиват грешките в json режим; изходен код при HTTP грешка на API-то.
Не е направено: CLI-ят в образа на пясъчника (нова зависимост в docker/sandbox, правило 8 → след 30.10 за 0.66.0 или 0.65.0
сега) и материализацията на settings.json/policies в /m/in/harness/gemini (компилаторът на профила има target само
claude/codex); агент `gemini`/`gemini+<връзка>` в работника и в UI-я. Q-072.
Тестове: agents gemini/gemini.test.ts; scripts check-test-counts.test.ts.
Статус: решено (живото и образът чакат).

## D-424 Gemini API през проксито: wire `gemini`, ключът само в проксито (28.10.2026)
Решение: (спец. 5.3 „GEMINI_API_KEY → mdt_ токен, маршрут /v1beta/* [НП]“) Wire += `gemini`, ProxyUpstream.auth +=
`x-goog-api-key`, токенът има `p: "gemini"`. Проксито приема само `POST /v1beta/models/<модел>:{generateContent,
streamGenerateContent,countTokens}` с празен query или `alt=sse` (никакъв `?key=`); моделът е от пътя и трябва да е в
списъка на upstream-а; агентът праща mdt_ токена като `x-goog-api-key` (така прави @google/genai 1.30.0, който CLI-ят
ползва — unpkg.com/@google/genai@1.30.0/dist/node/index.mjs, 28.10.2026), проксито го сменя с истинския ключ. Броене от
`usageMetadata` (promptTokenCount − cachedContentTokenCount = вход, cached = cache read, candidates + thoughts = изход),
при SSE последното парче; countTokens = $0; цена — плоската на връзката (без цена → оценка по Sonnet, D-392). Gemini няма
собствен ключ в проксито — само като записана връзка (boot payload). Вратата: `GEMINI_KEY_ROUTES` (prefix
`/v1beta/models/`); каналът `conn-<id>` с provider gemini дава `GEMINI_API_KEY` + `GOOGLE_GEMINI_BASE_URL`.
Не е направено: доставчик „Google Gemini“ в каталога PROVIDERS и в /welcome (ProviderInfo.agent е claude|codex; иска UI) —
Q-072. Пътищата и заглавката са от кода на SDK-а, не от жив рън [НП].
Тестове: llm-proxy proxy-gemini.test.ts; channels connection-channel.test.ts.
Статус: решено (живото чака ключ).

## D-425 Gemini CLI с Google вход: профил `gemini-profile-<име>` и тунелите (28.10.2026)
Решение: (спец. 5.3) непромененият CLI с `oauth-personal`; входът е в ~/.gemini/oauth_creds.json → volume на профила в
`GEMINI_CLI_HOME`; системните настройки за профила са `GEMINI_LOGIN_SETTINGS` (същите, selectedType oauth-personal).
Канал `gemini-profile-<име>` (kind cli_profile, provider gemini) без токен; вратата отваря CONNECT само към
cloudcode-pa.googleapis.com, oauth2.googleapis.com, www.googleapis.com (packages/core/src/code_assist/server.ts и
google-auth-library 10.9.0, 28.10.2026) [НП: на живо]. Входът без браузър в headless е отказан от CLI-я (exit 41) —
затова входът е интерактивен веднъж (както `mandat login`), задачите после ползват кеша.
Условия: docs/resources/tos-privacy.md (28.10.2026) забранява достъп до услугите зад Gemini CLI „чрез софтуер на трети
страни“ и не казва изрично, че непромененият CLI в обвивка е позволен — D-295 може да не важи; Q-073. Затова вход с
Google не е включен в UI/CLI (`mandat login --agent gemini` няма) — само каналът и тунелите, изключени, докато Симо реши.
Тестове: channels connection-channel.test.ts; agents gemini.test.ts (профил без ключ).
Статус: решено частично (входът чака Q-073).

## D-426 Codex с ChatGPT: `mandat login --agent codex`, тунелите по кода на Codex (28.10.2026)
Решение: (спец. 5.3) D-393 направи входа от уеба (`codex login --device-auth` в volume `mandat-profile-codex-<име>`).
Липсваше терминалът: `mandat login --agent codex --name <име>` и `mandat logout --agent codex --name <име>` (по
подразбиране claude; друго → E_USAGE). Тунелите на профила са стеснени до двата хоста от кода на Codex (openai/codex
main, 28.10.2026): `CHATGPT_CODEX_BASE_URL = https://chatgpt.com/backend-api/codex` (codex-rs/model-provider-info/src/lib.rs)
и `REFRESH_TOKEN_URL = https://auth.openai.com/oauth/token` (codex-rs/login/src/auth/manager.rs); api.openai.com е базата
само при API ключ и вече не се отваря [НП: жив рън потвърждава, че друго не трябва; Q-074].
Тестове: cli accounts.test.ts; channels connection-channel.test.ts.
Статус: решено (живият вход и задача чакат Симо).

## D-427 Доставчик „Google Gemini“: ключ в UI-я, агент `gemini` / `gemini+<връзка>` (28.10.2026)
Решение: (Q-072, Симо: „довърши Gemini докрай“) PROVIDERS += `gemini` (api_key, agent gemini, wire gemini, адрес
https://generativelanguage.googleapis.com, x-goog-api-key, ключ от https://aistudio.google.com/apikey). Модели по
https://ai.google.dev/gemini-api/docs/models (обновена 22.10.2026) и цени по /pricing (28.10.2026): gemini-3.8-flash
(препоръчан, $1,50/$7,50), gemini-4-argon (най-способен, $4/$20), gemini-3.5-flash-lite (бърз, $0,30/$2,50) — по-високите
цени от 01.12.2026/01.01.2027, за да спира бюджетът по-рано; без такса за запис в кеша (cacheWrite = input) [НП: имената на
живо]. Ключът се поставя в /welcome или Настройки → Модели („Google Gemini“ в групата „API ключове“), проверява се веднъж
с `GET /v1beta/models` (ключът в x-goog-api-key, никога в `?key=`; https://ai.google.dev/api/models, 28.10.2026; 400/401/403
→ лош ключ — 400 API_KEY_INVALID [НП]), запечатва се в ConnectionStore и стига само до проксито (boot payload, D-345);
никъде не се логва и не се връща. Агент: `gemini+<връзка>` (полето за задача го предлага като „Gemini CLI · <име>“);
`gemini` = връзката с id `gemini`; `gemini@…` няма (Q-073). Работникът: routeOf → `conn-<id>`; CLI-ят трябва да говори
жицата на връзката (Gemini CLI само с Gemini връзка).
Тестове: contract connections.test.ts; cli connections.test.ts; web agents.test.ts; worker agent-route.test.ts.
Статус: решено.

## D-428 Gemini CLI 0.65.0 в образа на пясъчника; средата на агента (28.10.2026)
Решение: `@google/gemini-cli` 0.65.0 (Apache-2.0, 20.10.2026; 0.66.0 е по-млада от 3 дни), закрепен по integrity като
claude и codex; един bundle без задължителни зависимости — optional node-pty/keytar не се инсталират, без install скриптове
(`npm view @google/gemini-cli@0.65.0`, 28.10.2026). Ред в docs/dependencies.md. Образът носи `/etc/gemini-cli/settings.json`
(packages/agents/gemini/settings.json = `GEMINI_SYSTEM_SETTINGS`; хешът на тага го включва). Фаза agent с tokenName
`GEMINI_API_KEY`: тайните са само mdt_ токенът (`GEMINI_API_KEY`, вече в SECRET_ENV_NAMES — само по име, D-043) и канарчето;
публичната среда — `GOOGLE_GEMINI_BASE_URL=http://egress-gate`, `GEMINI_CLI_HOME=/home/agent` (tmpfs),
`GEMINI_CLI_TRUST_WORKSPACE=true`, `NO_BROWSER=true`. Работникът маха `GEMINI_API_KEY`/`GOOGLE_API_KEY` от своята среда (D-008).
Проверено в Docker (D-430): http base URL към вратата работи; `selectedType: gemini-api-key` не дава exit 41; ключовете в
настройките не чупят CLI-я.
Тестове: agents gemini.test.ts; sandbox sandbox.test.ts, mcp-role.test.ts; worker run.test.ts (fake docker).
Статус: решено.

## D-429 Компилатор на профила: target `gemini` (28.10.2026)
Решение: `compileGemini` (packages/profile/src/gemini.ts): правилата за bash → Gemini CLI policies TOML
(`/m/in/harness/gemini/policies/mandat.toml`; `[[rule]] toolName = "run_shell_command"`, `commandPrefix` за `cmd *`,
`commandRegex` за други шаблони, deny 900 / ask 800 / allow 100; ask = deny с „needs approval: …“, защото headless CLI-ят
и без това прави ask_user на deny — https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md,
28.10.2026). argv: `--policy /m/in/harness/gemini/policies --include-directories /m/in/harness` (инструкциите на профила
стават единственият контекстен файл — `context.fileName: ["instructions.md"]` в настройките на образа; GEMINI.md на
репото не се чете [НП: с истински модел]). path:write и net остават на харнеса (D4, вратата); MCP, hooks, скилове и
подагенти са „unsupported“ и се изброяват. RULES: bash за gemini е вече native.
Тестове: profile compile.test.ts.
Статус: решено.

## D-430 Docker тест: истинският Gemini CLI с фалшив Gemini endpoint (28.10.2026)
Решение: apps/worker/src/gemini.docker.test.ts — задача с агент `gemini` минава през daemon → routeOf → истинския Gemini
CLI 0.65.0 в пясъчника → вратата → тестово прокси, заредено (boot) със записаната връзка „Google Gemini“ и фалшив ключ →
stub-а (`/v1beta/models/<m>:{streamGenerateContent,generateContent,countTokens}`: първият ход иска `run_shell_command`
със sed, който поправя прага; след резултата — текст). Задачата завършва с VERIFIED; дневникът на проксито показва
provider gemini и upstream gemini, без ключа; транскриптът няма ключа. Втори случай: одобрен профил → target gemini,
CLI-ят приема `--policy` и `--include-directories`, без предупреждения. За теста проксито приема http upstream към име на
контейнер само с `MANDAT_PROXY_ALLOW_INSECURE_UPSTREAM=1` (тестов флаг, както за E0 upstream-ите).
Живият тест (истински ключ) остава SKIPPED (gemini.test.ts, D-423) до Симо — чеклист 34.
Статус: решено.

## D-431 Настройките на Gemini CLI са само в образа: CLI-ят пропуска файл под /m (28.10.2026)
Наблюдение (Docker тестът, D-430): с `GEMINI_CLI_SYSTEM_SETTINGS_PATH=/m/in/harness/gemini/settings.json` Gemini CLI
пише „Skipping system settings file … Parent directory '/m' is insecure: … not owned by root“ и пада на auth `gateway` →
„Invalid auth method selected.“, exit 41 (потвърждава [НП] от D-423). /m е на агента (uid 1000) по дизайн.
Решение: компилаторът не пише settings.json и не задава пътя; пълните настройки (вкл. `hooksConfig.enabled: false` и
`context.fileName`) са в root-собствения `/etc/gemini-cli/settings.json` на образа — те не зависят от профила. Профилът
носи само policies и флаговете. Docker тестът проверява, че stderr на агента няма „insecure“/„Skipping“.
Статус: решено.

## D-440 Ключът за Exa в „Ключове“: запечатан, само в проксито (28.10.2026)
Решение: в „Ключове“ има раздел „Търсене за ресърча (Exa)“ с поле за ключа. Пътят е същият като на ключовете за модели
(D-293, D-345): уебът → `POST /api/keys/research` (само с `keys.manage`, CSRF) → контролният адрес на `mandat local`
(`/keys/research`, 127.0.0.1 + bearer) → `setSearchKey` запечатва ключа като `research:exa` в keys.sealed.json (KEK,
E7в) → проксито се пуска наново и го взима от склада в boot payload-а (`{"search":{"exa":…}}`, D-411). `EXA_API_KEY` в
средата вече не е нужен (остава като еднократен вход за `proxy start`). Само ключът за Exa стига, за да тръгне проксито
(ресърч с абонамент + Exa). `MANDAT_PROXY_PROVIDERS` назовава `exa` (име, никога стойност); страницата показва „Готов“.
Махане: ключът се трие от склада и проксито се пуска без него (или спира, ако не остане ключ). Ключът не се връща в
отговор, не се пише в лог, не е в env или argv на контейнер.
Тестове: local-control.test.ts, proxy-keys.test.ts (cli), keys.test.ts (web).
Статус: решено.

## D-441 Ресърчът в пясъчника: вграденият сървър `research` в собствен сайдкар зад вратата (28.10.2026)
Решение: агентът в пясъчника ползва research_* през същия път като всеки MCP сървър от E8д: `http://egress-gate/mcp/research`
(маршрут на вратата с бюджет в минута) → бриджът на E8д (stdio → streamable HTTP, заключен хеш на инструментите) в сайдкар с
роля `mcp` (същото hardening, 1000:1000, без volume, без тайни, без /m/work, без LLM ключ). Сървърът не се тегли от npm:
образът на пясъчника го носи (`/opt/mandat/research-mcp`, `pnpm deploy` до бриджа), затова research-mcp вече не зависи от
worker-а (pg направо). В профила той е ред в слой E: `RESEARCH_MCP_REF` (contract; `@mandat/research-mcp@0.1.0`,
`tools_hash` заключен — pin.test.ts го сверява със самия сървър; друг хеш → блок `mcp_definition_changed`). Ресърчът чете
публичния уеб, затова само този сайдкар тръгва на `mandat-upstream` (buildRunArgs го позволява само на роля mcp с име
`mandat-mcp-<run>-research`; на агента и на сървърите от каталога — отказ) и после влиза във вътрешната MCP мрежа на рън-а,
където го стига вратата. Агентът няма друг изход освен вратата. В сайдкара: собственото търсене (SearXNG
`http://mandat-searxng:8080` + отворените API, `--providers` стеснява списъка) и HTTP стълбата със SSRF проверките (D-405);
без браузърно ниво (няма Docker в сайдкара), без Exa и Anthropic търсене (няма токен), research_ask/recall казват, че искат
работника (няма база). Рискът: текстът на заявките стига до търсачките (канал навън, извън вратата) — затова сървърът е
по избор в профила (не се добавя сам) и вратата брои повикванията. Отворено: Q-080, Q-081, Q-082.
Тестове: mcp-role.test.ts (sandbox), pin.test.ts (research-mcp), research-schemas.test.ts (contract),
research-sidecar.docker.test.ts (worker: инструментите през вратата, търсене в локален SearXNG фикстур, частен адрес и
измислен URL — отказ, VERIFIED).
Статус: решено от кодера; Симо може да го обърне (Q-080, Q-081).

## D-442 Браузърното ниво с UI образа, проверено срещу локална страница (28.10.2026)
Решение: стълбата за четене вече ползва UI образа (`pnpm mandat images build --ui`, Playwright 1.63.0) в работника, когато
образът е там (`browserRenderer`, D-405). За Docker теста `buildRenderArgs` има режим с фикстури: `--network none`, папка
само за четене в `/opt/mandat/ui/fixtures`, `MANDAT_RENDER_FIXTURES`; render.mjs отговаря на всяка заявка на страницата от
`<папка>/<хост>/<път>` (`fixtureFile`: нищо извън папката), иначе 404. Hardening флаговете са същите (SANDBOX_HARDENING).
Тестът: HTTP дава само JS обвивката → „thin“ → истински Chromium пуска скрипта (той тегли /data.json от същия произход) →
текстът е от браузъра (`tier: browser`). Без външна мрежа. Под натоварен Colima първото пускане на Chromium отнема до ~2 мин;
тестът дава 90 s на страница (по подразбиране в работника остават 20 s + 25 s).
Тестове: browser.test.ts, browser.docker.test.ts (нов проект `research` във vitest.docker.config.ts).
Статус: решено.

## D-443 Кешът на Turborepo пази и `.next` на уеба (29.10.2026)
Решение: `apps/web/turbo.json` (по образеца на `apps/site/turbo.json`, D-371) разширява главния `turbo.json` с изходи
`.next/**` без `.next/cache/**` и с входове src/**, public/**, next.config.ts, postcss.config.mjs, tsconfig.json, package.json.
Защо: при попадение в кеша turbo връща само обявените изходи, а главната задача обявява само `dist/**`. След сливането на
E9в уебът беше построен в друг worktree със същите входове; `pnpm build` тук отчете „cached“, но `.next` остана отпреди
сливането и `pnpm local` показа стария интерфейс без Gemini. Главният `turbo.json` не е пипан, защото влиза в хеша на
таговете на образите (D-078) и би ги сменил.
Тестове: scripts/turbo-outputs.test.ts.
Статус: решено.

## D-444 Загубена връзка с базата не спира worker-а (30.10.2026)
Една изтекла връзка събаряше целия `pnpm local`: цикълът на ефектите отхвърляше обещание, което никой не чака, а `pg`
изпраща `error` за умряла връзка и без слушател това спира процеса. Сега пулът и заетите връзки имат слушател, а
`workerSlots` чака следващия цикъл при загубена връзка и пише по един ред при загуба и при връщане.
Само грешките за връзка се преживяват (`isDbConnectionError`): SQL грешка или бъг си остават видими, а `--once` ги връща на
извикващия. Задача, която е вървяла по време на прекъсването, не е част от тази поправка.
Тестове: apps/worker/src/online/db.test.ts, packages/cli/src/worker-slots.test.ts.
Статус: решено.

## D-445 Списъкът с входовете не трупа контейнери (30.10.2026)
Началната страница и „Модели“ при всяко зареждане питат за входовете в абонамент, а това пуска по един контейнер
`claude auth status` за всеки вход. При бавна машина заявките се застъпват: видяхме 14 контейнера наведнъж, натоварване 55 във
виртуалната машина на Docker, уебът спря да отговаря, а връзките към базата изтичаха. Сега едновременните заявки чакат една и
съща проверка (`sharedWhileRunning`). Кеш с време нарочно няма: след вход или изход страницата трябва да покаже новото веднага.
Тестове: packages/cli/src/accounts.test.ts.
Статус: решено.

## D-446 Какво прави задачата в момента: фази и проблеми на доставчика в потока (02.11.2026)
Решение: докато задачата тече, интерфейсът винаги казва какво става, на прост език (bg/en). Работникът отчита два нови вида
редове в `session_lines`: `phase` (затворен списък `RunPhase`: provision, install, agent, export, verify, verdict) и
`provider` (затворен списък `ProviderProblem`: overloaded, rate_limited, timed_out, key_rejected, unknown, с опита: `overloaded 4/10`).
Уебът превежда само кодовете към фиксиран текст (`phaseLine`, `noticeLine`); известието изчезва при отговор на модела или нова фаза.
Защо `session_lines` с нови видове: четат се и от viewer (`task_activities` е approver+), вече стигат до браузъра през SSE с курсор,
редът им спрямо редовете на агента е даден от `seq`. Отделен вид, не `step` с префикс: адаптерите излъчват само старите видове,
така агент с текст „verify“ или „overloaded 4/10“ не може да се представи за фаза или за известие. Цена: една миграция за CHECK ограничението.
Състоянието остава RUNNING: сменяне на състоянията би минало през board_column, TONES и потока на статусите без нужда, а фазата се вижда и така. Значката в задачата е „Running“, не „Agent working“: иначе лъже по време на подготовка и проверка.
Сесията на водача вече се създава при първата фаза, не при първия ред на агента (иначе няма къде да се запише provision).
Сурови думи от stderr не стигат нито до базата, нито до екрана: `providerNotice` на адаптера връща само код и номер на опит, тестът го проверява с белязан низ в stderr. Самият `agent-stderr.txt` остава в директорията на изпълнението, както досега.
Форматът е по адаптер (`AgentAdapter.providerNotice`, незадължително). Само Gemini го има; Claude и Codex нямат познат формат от stderr и затова просто не дават известие, не се преструваме. Несходен ред = без известие; разпознат опит с непозната причина = `unknown`.
Източник за формата на Gemini CLI 0.65.0: реалното изпълнение r_01M6DNMT6P4ZVBWX622FMVMSK5, 02.11.2026 (fixtures/gemini-stderr/retries.txt с маскирани съобщения).
[НП] 10 опита като твърда граница на CLI-я: толкова направи това изпълнение; кодът на CLI-я не е четен. Спайк: прочети `maxAttempts` в gemini-cli при следващото вдигане на версия. Ако е грешно, „опит 4 от 10“ лъже само в знаменателя.
Алтернативи: `task_activities` (viewer не вижда), нови състояния PROVISIONING/EXPORTING (шире промяна, не дава повече), тълкуване на stderr в браузъра (сурови думи в базата, забранено).
Тестове: run-status.test.ts, provider-notice.test.ts, run.test.ts, stream-to-workbench.test.ts, chat.test.ts, status.test.ts. Статус: решено.

## D-447 Без проверка, когато няма какво да се провери (02.11.2026)
Решение: ако износът има 0 променени файла и договорът няма `must_pass`, дърветата за проверка не се пускат (`nothingToCheck` в packages/core, чиста функция). Записва се честно: EXPORT unknown с подпис `EXPORT:empty_change:-`, данни `{files: 0, verification: "skipped"}`, резултат UNKNOWN, D1–D11 n/a, изход 10. Никога VERIFIED.
Защо: задача „hi“ чака 143 s пълна проверка на непроменен код и накрая получава VERIFIED за нищо; това е и загуба на време, и лъжа за това какво е проверено.
Защо така, не с нов режим или поле на присъдата: подписът `EXPORT:empty_change:-` вече съществува и значи точно това (verify-change.ts, D-288, explain.ts дава текста), mandat verify го ползва. `VerifyMode` описва откъде идва промяната, не дали е проверена. Нов резултат би пипнал `decideVerdict`, стълбата и доставката, без да казва нещо повече. CANARY и INTEGRITY продължават да вървят (нямат нужда от дървета): canary в бележките на празна промяна пак е FAILED.
Правилото е само от факти: броят файлове идва от износа, `must_pass` е запечатан в договора преди агента. Думите на агента, изходът му и резултатът му нямат вход във функцията (агентът не може да се измъкне от съдията с приказки). Изтрит файл е променен файл; всяка промяна минава пълната проверка, каквото и да каже агентът и както и да е излязъл (тестове в run.test.ts).
Отклонение от заръката „0 файла → без дървета“: изключение при непразен `must_pass`. Причина: сценарий B12 (`b12-empty`, bench/scenarios.ts) и тестът „edge: no-op“ очакват FAILED `MUST_PASS:not_passed` за празна промяна. Договор, който изисква тест, трябва да получи отговор, иначе агент, който не прави нищо, ще е UNKNOWN вместо FAILED: това отслабва съдията. Сценарият не е променен. Онлайн `contractForTask` дава `must_pass: []`, затова случаят „hi“ се покрива изцяло. Всички договори в contracts/ имат `must_pass`, така че bench и redteam вървят както преди. Дали B12 да остане така е решение на Симо.
Демонът: `onlyEmpty` (само EXPORT:empty_change или старото VERIFIED с 0 файла) → HELD empty_change, както D-288, със записан резултат и причини в `task_stopped`. Празна промяна с друг отворен въпрос (напр. AGENT:config_change) минава обичайния път с причините си.
Тестове: nothing-to-check.test.ts, run.test.ts (D-447), daemon.test.ts (D-447). Статус: решено; B12 чака преглед.

## D-448 Честен край: истинската причина, а отговорът е резултат (02.11.2026)
Решение: задача без промяна завършва според това, което работникът е видял от агента (`AgentEnding`: изход, грешка в резултата, текст към човека, последен проблем с доставчика), никога според твърденията му:
- грешка или ненулев изход → HELD `agent_failed:<код>`; кодът е истинската причина (ProviderProblem; 429 от проксито значи rate_limited, иначе unknown). Показва се на прост език, например „Google беше претоварен и не отговори…“. Известие web_push „failed“. Повторно пускане има. Агент, който отговори и после падна, пак е провал.
- успех и текст → CLOSED `answered`, `outcome_decided`, без предупреждение, без доставка, без стълба. Отговорът се показва отгоре, под него „Няма променени файлове.“ (факт, не провал).
- успех без текст → HELD `empty_change`, както D-288; текстът вече казва и че агентът не е казал нищо.
Промяна + каквото и да е приказване минава съда и доставката както винаги (тест „talking changes nothing“).
Защо CLOSED, не HELD, за отговор: HELD значи „чака човек“ и задачата влиза във „Чакат те“; при отговор на „hi“ нищо не чака. Има прецедент: CLOSED с `wait_reason` „rejected“ и „expired“. Защо `wait_reason` с код, не ново състояние или колона: прецедент `infra:<код>`, няма миграция и няма нов преход. Без присъда в таблицата `verdicts`: нищо не е съдено; `task_stopped` пази резултата и причините (D-447).
Защо „нова задача с друг модел“: повторното пускане пази модела; смяна на модела при повторение няма, а изборът съществува само при нова задача. Текстът казва това, което наистина може да се направи.
Известно ограничение: агент, помолен да поправи бъг, който каже „готово“ без промяна, също завършва `answered`. Не се доставя нищо, а „Няма променени файлове.“ стои под отговора; разликата „въпрос“ / „задача“ не може да се реши от факти.
Тестове: daemon.test.ts (D-448), status.test.ts, chat.test.ts, keys.test.ts. Статус: решено.

## D-449 Проксито и вратата спират да чакат, когато клиентът си отиде; `duration_ms` в дневника (02.11.2026)
Решение: при прекъсване от клиента llm-proxy прекъсва заявката си към доставчика (и към търсачката, D-411), а egress-gate прекъсва препращането си. В дневника на проксито всяка заявка има `duration_ms` (без тела); прекъснатата има `aborted: true`.
Защо: Gemini CLI се отказва от заявка след 60 s без заглавки и пробва пак, а проксито продължаваше да чете: 3 закъснели отговора за ~$0.05, които никой не прочете. Веригата е CLI → врата → прокси → доставчик, затова спират и двете звена; вратата сама не би спряла проксито.
Какво се записва при прекъсване: само видяното. Преди отговор: статус 499 (без отговор от доставчика, 499 е обичайният код за „клиентът затвори“), 0 токена, $0. По време на поток: истинският статус и последната видяна употреба, оценена по цената. Не допълваме числа: ако доставчикът все пак таксува прекъсната заявка, това не се вижда тук. Ред с `aborted` не брои към no_tools (отговорът не е цял, D-422). 401/403/429 вървят както досега, защото статусът е истински. Прекъсната заявка се брои в `requests`.
Търсенето: прекъснато търсене излиза със статус 0 и $0, по същото правило за цена като недостъпен доставчик.
Вратата пише ред `allow` със статус 499 и видяните байтове; иначе прекъснатото препращане нямаше да остави следа. Кешираното изтегляне на npm .tgz остава незасегнато: то пише във файл и няма защо да спира.
Тестове: proxy-abort.test.ts (бавен доставчик: мълчи, половин поток, цял отговор), gate.test.ts (D-449). Статус: решено.

## D-450 Цената на задачата е това, което проксито е записало, при всеки край (02.11.2026)
Решение: `tasks.usd` (и събитието към таблото) се записва от `v.usage.usd` при всеки край с присъда, не само по пътя на доставката: отказан ключ, искане за инструмент, празна промяна, провал на агента и отговор вече я пишат.
Защо стоеше на 0: присъдата носеше $0.0504 (9 заявки в r_01M6DNMT6P4ZVBWX622FMVMSK5), проксито я беше отчело вярно. Но `usd` се четеше чак след клона `empty_change` и той правеше `setState` без нея; същото важеше и за `key_rejected` и `tool_approval`. Парите са изхарчени и при провал, затова показваме и тях.
Отговори, които клиентът е изхвърлил, влизат само доколкото проксито ги е видяло (D-449): числа не се измислят.
Известно, непроменено: при нов опит (retry, rebase, изчакване на лимит) `tasks.usd` се презаписва с цената на последното изпълнение, а не се събира. Заявката е за цената на изпълнението; сумирането е отделно решение.
Тестове: daemon.test.ts (D-450), run.test.ts. Статус: решено.

## D-451 Заседнала задача не остава „работи“ завинаги: почистване при всеки пас на работника (03.11.2026)
Решение: `sweepOverdue` (apps/worker/src/online/sweep.ts) тече в `drain` на `mandat worker` при всеки пас, до изтичането на HELD. Задача в работно състояние (CONTRACTED, PROVISIONING, RUNNING, EXPORTING, RETRY, VERIFY_1, REBASING, PUSHED, VERIFY_2, VERDICT) е просрочена, когато срокът ѝ е минал: `state_deadline_at`, иначе `state_entered_at` + максимума на състоянието (D-211, `MANDAT_STATE_MAX_MIN_<STATE>`). Ако този процес още я обработва (`isProcessing`, множество в `runDaemonOnce`), срокът се удължава. Ако не я обработва, тя става BLOCKED с `runner_offline`, а във verify с `infra:lease_lost`. Записват се `task_stopped` в дневника и web_push `failed`. Ако за опита има присъда, задачата не се пипа (никога втора присъда).
Защо: след срив на работника три задачи стояха в RUNNING без срок (`state_deadline_at` не се пишеше никъде, `sweepDecision` се викаше само от тестове). Те заемаха места в лимита от 3 живи задачи на хранилище (`claimNext`), затова новите задачи не тръгваха.
Как: `setState` нулира `state_deadline_at` при всяка смяна; колоната държи само удължения. За RUNNING почистването не знае `task_minutes` на задачата, затова взима най-големия бюджет, който политиката позволява (120 мин, `MAX_TASK_MINUTES`). Задача на умрял работник се освобождава най-късно след 2 ч в RUNNING и след 10–60 мин в другите състояния. GATED и HELD чакат човек и не се почистват тук (HELD изтича по E8g, held-expiry.ts).
Отклонение от т. 4 на спец.: там мъртъв verify дава присъда UNKNOWN. Почистването няма запечатана присъда, която да запише, затова пише BLOCKED с `infra:lease_lost` и без присъда. Симо може да го обърне.
Известно, непроменено: повече от един процес `mandat worker` върху една база вижда чуждите живи задачи като мъртви, когато срокът им изтече. Локално работникът е един.
Тестове: sweep.test.ts, lease.test.ts. Статус: решено от кодера; Симо може да го обърне.

## D-452 Страницата на задачата показва текущия опит, не предишния (03.11.2026)
Решение: в общата заявка на задачите (apps/web/src/lib/server/queries.ts, `TASKS`) промяната (changesets) и присъдата (verdicts) се взимат само за `attempt = t.attempt`. Докато новият опит няма своя присъда и промяна, страницата не показва такива: нито доказателства, нито diff, нито одобрения.
Защо: при нов опит (повтор, кръг на CI, нощна смяна, rebase) заявката взимаше последната по `attempt desc`. Така задача в RUNNING на опит 2 показваше присъдата и промяната на опит 1, сякаш са текущи.
Сесията на агента (workbench.ts, chat-feed.ts) не е променена: взима се най-новата водеща сесия по `started_at`, а сесията на новия опит винаги започва по-късно. Колона `attempt` в `agent_sessions` би помогнала само в кратката пауза, преди новата сесия да започне. Затова миграцията е отложена, докато не потрябва.
Библиотеката на промените (library.ts) нарочно показва последната промяна, независимо от опита: там се търси история, не текущо състояние.
Тестове: current-attempt.test.ts. Статус: решено от кодера; Симо може да го обърне.

## D-453 Codex и Gemini получават целия договор като промпт (04.11.2026)
Решение: `AgentRunContext` получава `contractText` (същите байтове като `/m/in/contract.txt`, `renderAgentContract`). Адаптерите
на Codex и Gemini го подават като промпт (последният позиционен аргумент на `codex exec`, `-p` на `gemini`). Claude не се
променя: чете файла с `--append-system-prompt-file`.
Защо: двата адаптера подаваха само `ctx.prompt` (текста на човека). Агентът не виждаше разрешените пътища, `must_pass`,
лимитите, паметта и правилото „Mandat решава присъдата“. Коментарите в `codex/argv.ts` и `gemini/argv.ts` твърдяха, че
договорът е в промпта; не беше. Заданието от E10а (docs/tasks/e10a.md, фаза 0) нямаше да стигне до Gemini.
Защо в промпта, не през файл: и двата CLI-я нямат флаг за системен промпт от файл, който не замества вградения;
`GEMINI.md`/`AGENTS.md` нарочно са изключени (D-423, D-431, S-CX). Договорът започва с реда „Task (<type>): <текст>“, затова
задачата не се губи. Размерът е малък (паметта ≤ 2,8 KB, MEMORY_BUDGET), далеч под лимита за един аргумент.
Цена: за тези два агента договорът е в хода на потребителя, не в системния промпт. Присъдата не зависи от това: съдията
проверява фактите, не думите на агента.
Не е проверено на живо: истински Gemini или Codex с договора (чака ключ). Docker тестът с истинския Gemini CLI (D-430)
не е пускан след промяната.
Тестове: gemini.test.ts и codex.test.ts („gets the contract (D-453)“). Статус: решено от кодера; Симо може да го обърне.

## D-454 Тестовете минават и на Windows (04.11.2026)
Решение: само тестове и конфигурация, без промяна в кода на продукта.
- **По-дълъг таймаут на Windows** (vitest.config.ts): 60 s на тест и 90 s на hook, вместо 20/30 s. Причината е, че git и пускането на процеси там са в пъти по-бавни. При пълен паралелен прогон 9 теста на работника минаваха 20 s. Изолирани минаваха.
- **`import.meta.dirname` вместо `path.dirname(new URL(import.meta.url).pathname)`** в 7 тестови файла. Това е същият бъг като D-414, но в тестовете: `C:\C:\…`.
- **Пътищата във фиксчърите на sandbox са POSIX.** На Windows `path.resolve` ги прави `C:\home\…`. Помощникът `posix()` в sandbox.test.ts ги връща за снимките; на Linux не прави нищо.
- **CLI:** очакваният път в `verify-log` минава през `path.join`. `pnpm` се пуска с `shell` на Windows (там е `pnpm.cmd`). Пътят към Dockerfile се сравнява с `/`.
- **Правата на файла с тайната (0o600) не се проверяват на Windows.** Там няма POSIX права и `mode` е винаги 0o666; файлът е защитен от ACL на потребителския профил.
- **WSL DrvFs:** частта на doctor с `/mnt/c/…` се пропуска на Windows, защото такъв път съществува само вътре в WSL. Чистите проверки на `wslDrvFs` остават.
- **web:** service-role-scope сравнява POSIX имена. Прозорецът на SSE теста на task-stream е 1500 ms вместо 300 ms, защото под натоварване изтичаше.
Известно, непроменено: пълният прогон на Windows е бавен (минути), а Docker тестовете (`pnpm test:docker`) не са пускани тук. Статус: решено от кодера.

## D-490 Незадължителен вход: без него нищо не излиза от машината (04.11.2026)
Решение: входът е по избор. Без `MANDAT_SYNC_URL` няма „Влез“, а само обяснение. С адрес, но без вход, всяка функция на
устройството (`device.ts`) връща резултат без нито една заявка. `pnpm local` и десктопът остават на 127.0.0.1 както при
D-368. С вход устройството синхронизира настройките, езика и темата, връзките (абонаментите като метаданни), API
ключовете (само запечатани), MCP/скиловете, проектите и историята на задачите.
Защо: Симо иска след влизане от всяко устройство да има всичко, но входът да не е задължителен.
Тестове: device.test.ts („without an account nothing leaves the machine“, 2 теста с шпионин на fetch), account-api.test.ts.
Статус: решено от кодера.

## D-491 Сървърът за синхрон: еднакъв код, отделна база, принудителен RLS (04.11.2026)
Решение: сървърът е същият `apps/web`, пуснат с `MANDAT_SYNC_SERVER=1` (`/api/account-auth/*`, `/api/sync/*`,
`/account/device`). Пази записите в собствен Postgres (`MANDAT_SYNC_DB_URL`, схема `sync` от
deploy/sync-server/schema.sql), не в базата на `pnpm local`. Запис = (човек, вид, id, ревизия, тяло JSON). Ревизията е брояч
за всеки човек: pull(since) дава всичко по-ново, а push пише само при съвпадение на baseRev (compare-and-set), иначе връща
копието на сървъра като конфликт. Всяка транзакция е с ролята `mandat_sync` и `mandat.sync_uid`. RLS е принудителен (FORCE),
затова заявка без WHERE пак вижда само записите на един човек. API-то приема само bearer токен на устройство, никога
бисквитка, така че CSRF към него няма откъде да дойде.
Защо: един код за двете роли; базата на сървъра е отделена от локалната; RLS остава защитата при грешка в заявка.
Тестове: server.test.ts (правилата върху паметта), sync-store.test.ts (Postgres/PGlite, RLS, проверки в базата).
Статус: решено от кодера; живата база е [НП] (Q-105).

## D-492 Моделът на синхрон: сървърът е истината, устройството пази кеш, сливане по полета (04.11.2026)
Решение: устройството пази кеш (`private.account_cache`: тяло, ревизия, база, „мръсен“). Един пас: pull → сливане в
локалните промени → push с baseRev → конфликтите се сливат и се пращат пак (до 3 кръга). Сливането е тристранно по полета
спрямо последното общо копие. Поле, сменено и от двете страни, взима стойността на сървъра, а устройството получава
списък какво е загубило; UI-то казва „N промени бяха заменени“. Историята на задачите само се добавя: запис с еднакъв id
остава този на сървъра. Редът на ключовете в JSON не е промяна (`sameJson`): jsonb пренарежда ключовете.
Първо влизане: всичко локално е „мръсно“ с ревизия 0. Каквото го има само тук, се качва. Каквото го има само на сървъра,
се сваля. Каквото го има и на двете места, се слива: при разлика печели сървърът, а другите полета на устройството остават.
При излизане локалните данни остават, а кешът се връща към „първо влизане“ за следващия профил. Събирачите (`collectLocal`)
взимат езика и темата от бисквитките, проектите от `public.repos` и задачите от `public.tasks`. Текстът минава през
redaction, затова ключ в текста на задача не спира синхрона и не изтича. След синхрон езикът и темата стават бисквитки.
Защо: прост модел, без CRDT; сървърът е единствената истина, конфликтите са редки (един човек, няколко устройства).
Известно: проекти и задачи от друго устройство засега стоят само в кеша (Q-109); връзките, MCP/скиловете и ключовете
се връзват от другите три сесии през `collect` и `sealSecret`.
Тестове: merge.test.ts, engine.test.ts (две устройства, конфликт, отказ за ключ), local-store.test.ts, same.test.ts.
Статус: решено от кодера.

## D-493 API ключовете пътуват само запечатани с ключ на човека (04.11.2026)
Решение: на първото устройство се прави случаен 32-байтов ключ на трезора. Всеки API ключ се запечатва с него
(AES-256-GCM, aad = `secret/<id>`, затова плик не може да се премести в друг запис). Самият ключ на трезора отива на
сървъра само обвит с паролата за синхрон (scrypt N=2^15, r=8, p=1 → AES-256-GCM). На сървъра няма парола и няма ключ в
чист вид. Ново устройство иска паролата веднъж. Запис от вид secret е само `{label, provider, sealed}`.
Защо: условието на Симо „никога в чист вид на сървъра“; при пробив на сървъра ключовете остават запечатани.
Цена: забравена парола = синхронизираните ключове не се отварят; добавят се отново (казано в UI).
Известно: на устройството ключът на трезора и токенът стоят в `private.account_link` (Q-108).
Тестове: vault.test.ts, device.test.ts („a key arrives sealed, never in clear“ — нито в тяло на заявка, нито в хранилището).
Статус: решено от кодера.

## D-494 Последна проверка преди изпращане и пак на сървъра (04.11.2026)
Решение: `assertSafeOutbound` пуска всеки запис през правилата на redaction (префикси + ентропия). Запис от вид secret
трябва да е плик. Едно попадение спира целия push; съобщението назовава записа, никога стойността. Сървърът проверява
същото преди запис (422 `plaintext_secret`).
Тестове: outbound.test.ts, server.test.ts, engine.test.ts.
Статус: решено от кодера.

## D-495 Better Auth за входа; устройствата влизат с device flow през системния браузър (04.11.2026)
Проверено: better-auth 1.7.14, MIT (npm, 04.11.2026; 1.7.15+ са по-млади от 3 дни). Адаптери: pg Pool / Kysely
(https://www.better-auth.com/docs/adapters/postgresql), memory за тестове. Next.js App Router: handler по Request.
Plugins: magic link (https://www.better-auth.com/docs/plugins/magic-link), device authorization по RFC 8628
(https://www.better-auth.com/docs/plugins/device-authorization), bearer, multi-session; passkeys е отделен plugin.
За Electron има `@better-auth/electron` (https://better-auth.com/docs/integrations/electron), с PKCE и deep link. Всички
прочетени на 04.11.2026.
Алтернативи: Auth.js е част от Better Auth от 22.09.2025 и получава само поправки за сигурност
(https://www.better-auth.com/blog/authjs-joins-better-auth). Lucia е обявена за остаряла
(https://www.wisp.blog/blog/lucia-auth-is-dead-whats-next-for-auth). Supabase Auth би вързал входа към един доставчик и
GoTrue; за устройство на 127.0.0.1 няма device flow. Собствен вход значи повече код за сигурност.
Решение: Better Auth на сървъра за синхрон. Входове: GitHub и Google при зададени OAuth apps, имейл линк (в тестовете е
тестовият доставчик; на живо е изключен, Q-107). Устройството (`pnpm local` и десктопът) не показва форма за парола. То
пуска device flow; човекът отваря `/account/device` в системния браузър (десктопът дава всеки външен линк на
`shell.openExternal`, window-guard.ts), влиза и одобрява. Устройството получава токен на сесия (bearer). Затова не е нужен
`@better-auth/electron`, а потокът е един за браузър и десктоп. Изрично `disableOriginCheck: false`,
`disableCSRFCheck: false`: Better Auth ги изключва под тестов runner. Rate limit: 3 линка, 10 OAuth и 5 device кода на
минута за адрес. `cookiePrefix: mandat`, Secure на https. Телеметрията е изключена.
„Излез от всички“ = `/revoke-sessions`. „Изтрий данните ми“ изтрива записите, трезора и потребителя
(`internalAdapter.deleteUser`). Локалните данни остават.
Тестове: auth-server.test.ts (вход с тестов доставчик, httpOnly/SameSite, device flow, чужд клиент, CSRF, rate limit,
изход от всички), device.test.ts.
Статус: решено от кодера; истинските GitHub/Google не са пускани [НП] (docs/setup/auth.md).

## D-496 Настройките идват само от env (04.11.2026)
Решение: устройството ползва `MANDAT_SYNC_URL` (https или loopback http). Сървърът ползва `MANDAT_SYNC_SERVER=1`,
`BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` (≥ 32 знака), `MANDAT_SYNC_DB_URL`, `MANDAT_AUTH_GITHUB_*`, `MANDAT_AUTH_GOOGLE_*`
и `MANDAT_SYNC_TRUSTED_ORIGINS`. Ако нещо липсва, ролята е изключена. В `.env.example` има само имена.
Тестове: config.test.ts. Статус: решено от кодера.

## D-497 Локалният API на профила (04.11.2026)
Решение: `GET /api/account/{status,devices}` и `POST /api/account/{start,poll,vault,sync,signout,signout-all,wipe}`
съществуват само в `pnpm local` (`authMode() === "local"`) и само за собственика. Всеки POST проверява Origin и double
submit CSRF. Стъпките на входа, паролата и изтриването имат rate limit (10/мин на стъпка). Изтриването иска
`{confirm: "delete"}`. Отговорите носят състояние, никога токен или ключ. Заявките към сървъра имат таймаут 15 s; ако
сървърът не отговаря, грешката е обикновена и локалното продължава да работи. Адресът на страницата за вход, върнат от
сървъра, трябва да е на същия origin като сървъра.
Тестове: account-api.test.ts. Статус: решено от кодера.

## D-498 UI: „Влез“ в менюто и в Настройки, раздел „Профил и синхрон“ (04.11.2026)
Решение: самостоятелен компонент `components/connections/account/account-panel.tsx` на `/settings/account`. Има ред-линк
в Настройки и „Влез“/„Профил“ долу в страничното меню (само в `pnpm local`). Панелът показва: състоянието; кода и бутон за
страницата за вход (нов раздел, т.е. системният браузър в десктопа); паролата за синхрон; „Синхронизирай сега“;
устройствата; „Излез“, „Излез от всички“ и „Изтрий данните ми от сървъра“. Текстовете са на прост език, на bg и en.
Изгледът на състоянията е чиста функция (`lib/account-view.ts`).
Тестове: account-view.test.ts, i18n-catalog.test.ts. Статус: решено от кодера; не е гледано в браузър (дискът беше пълен).

## D-499 Какво остава за координатора (04.11.2026)
Решение: тази сесия дава рамката. Другите три сесии слагат своите данни в кеша. Връзки и абонаменти:
`collect(cache, [{kind: "connection", …}])` само с метаданни. API ключове: `sealSecret(device, id, label, plaintext)`.
MCP/скилове: `kind: "mcp" | "skill"`. Обратната посока (запис в техните таблици след pull) е на тях: четат
`private.account_cache`.
Статус: за координатора.

## D-470 Доставчиците на модели като данни: един запис = един доставчик (04.11.2026)
Решение: `packages/contract/src/provider-catalog.ts` държи каталога (zod `ProviderEntry`, проверява се при зареждане). Всеки
запис казва формата на API-то (`anthropic`, `openai` = Responses, `gemini`, `openai-chat`, `native`), базовия адрес, как
върви ключът (`x-api-key`, `bearer`, `x-goog-api-key`, `api-key` за Azure), страницата за ключ, документацията с датата и
предложени модели. Агентът следва формата: Anthropic → Claude Code, Responses → Codex, Gemini → Gemini CLI, иначе никой.
Проксито взима wire-а от записа; нов доставчик е един ред (и нищо в проксито, ако формата е един от трите).
Включени (30): Claude и ChatGPT абонаменти; Anthropic, OpenAI, Google Gemini, xAI, Mistral, Cohere, Perplexity; DeepSeek,
Qwen, Kimi, Z.ai, MiniMax, Baidu ERNIE, Doubao, Tencent Hunyuan; OpenRouter, Groq, Together, Fireworks, Cerebras; Azure
OpenAI, AWS Bedrock, Vertex; Ollama, LM Studio, vLLM; Anthropic-съвместим и OpenAI-съвместим адрес.
Защо: досега всеки доставчик беше и в кода, и в UI-я; каталогът като данни дава един източник и тест за всеки запис.
Codex приема само Responses (`wire_api = "responses"` е единствената стойност,
https://learn.chatgpt.com/docs/config-file/config-reference, прочетено 04.11.2026), затова доставчик само с Chat
Completions (Cerebras, Cohere) е `openai-chat` и няма агент (Q-095).
Източници: docs/integrations/api-providers.md (всички прочетени 04.11.2026). Не е проверено на живо: всички нови записи са
`live: false` [НП]; Baidu, Volcengine и Hunyuan са четени главно от откъси на официалните страници.
Тестове: provider-catalog.test.ts. Статус: решено от кодера; Симо може да го обърне.

## D-471 Колкото ключа иска човекът, по няколко на доставчик, всеки с име (04.11.2026)
Решение: всеки ключ е своя връзка с id `<доставчик>`, после `<доставчик>-2`, `-3` … (`nextConnectionId`) и име по избор.
Първият ключ на Anthropic / OpenAI пази старото име в запечатаното хранилище (`anthropic`, `openai`) и остава агентът
`claude` / `codex`; всеки следващ е `conn:<id>`, свой upstream в проксито и агент `claude+<id>` / `codex+<id>`.
В `connections.json` стоят само последните 4 знака (`keyHint`) и последната проверка (`check`); нов ключ нулира проверката.
Защо: човек има личен и служебен ключ, или ключове от няколко услуги; старите задачи и каналите не се чупят.
Тестове: connections-store.test.ts, connections.test.ts (cli). Статус: решено от кодера; Симо може да го обърне.

## D-472 „Провери ключа“: една заявка за 1 токен, четири ясни резултата (04.11.2026)
Решение: `checkKey` (packages/llm-proxy/src/key-check.ts) праща една заявка в собствения формат на доставчика
(`/v1/messages`, `/v1/responses`, `/v1/chat/completions` или `generateContent`, 1 токен). Резултат: работи / отказан (401,
403, 400 с „API key“) / няма кредит (402, или 429 и 400 с quota/balance/credit) / не отговаря (мрежа, 5xx, друг 404).
Сървър на този компютър: само `GET /v1/models` (не зарежда модел). Ключът е само в заглавката, никога в адреса; тялото на
отговора се чете до 4 KB и не се пише никъде.
Къде върви: в процеса, който държи запечатания ключ и пуска проксито (`mandat local`; кодът е в пакета на проксито), не в
контейнера на проксито. Защо: контейнерът получава ключовете веднъж през админ порта и не бива да има вход „прати заявка с
ключа“; проверката трябва да стане и преди ключът да бъде записан. Изходът е същият (този компютър → доставчика).
При добавяне: отказан ключ или мълчащ адрес не се записват; ключ без кредит се записва със статус „няма кредит“.
Защо 1 токен, не списък с модели: списъкът е безплатен, но не показва липса на кредит. Цената е под стотна от цента.
[НП]: точните кодове за липса на кредит при Mistral, Groq, Together, Fireworks, Cerebras, Qwen, Baidu, Doubao, Hunyuan.
Тестове: key-check.test.ts, connections.test.ts, local-control.test.ts, connections-api.test.ts. Статус: решено от кодера.

## D-473 Влезлите ключове стават модели за избор; агентът е показан честно (04.11.2026)
Решение: `taskAgents` (apps/web/src/lib/agents.ts) прави всяка връзка с ключ избор в полето за задача и в Настройки →
Модели, с препоръчания модел от каталога по подразбиране. Връзка, чийто формат никой агент не говори, не е избор; на
страницата пише „Още нито един агент тук не говори API формата на тази услуга“. `routeOf` в работника иска точно
съвпадение на CLI и формат (преди `codex+deepseek` стигаше до проксито и там получаваше 401).
Тестове: agents.test.ts, agent-route.test.ts. Статус: решено от кодера.

## D-474 Тестове, че ключът не стига до базата, лога и пясъчника (04.11.2026)
Решение: три теста. База и лог: connections-api.test.ts праща ключове през web API-то и проверява всеки ред на всяка
таблица (`row_to_json`) и целия изход на console. Файл: connections-store.test.ts — `connections.json` няма ключа.
Пясъчник: connection-channel.test.ts — каналът на `conn-anthropic-2` дава на агента само mdt_ токен; ключът не е в env и в
маршрутите. Статус: решено от кодера.

## D-475 Настройки → API ключове; /keys пренасочва (04.11.2026)
Решение: страница `/settings/api-keys` с раздел `apps/web/src/components/connections/api-keys/` (`ApiKeysPanel`: ключовете
с име, услуга, последни 4 знака, статус, кой агент ги ползва, „Провери ключа“, „Махни“; „Добави ключ“ с услугите по групи).
Под него е всичко, което `/keys` показваше (абонаменти, старата форма за един ключ, ключът за Exa, каналите), затова
`/keys` само пренасочва и нищо не се губи. В Настройки има ред-линк „API ключове“. Първата страница (/welcome) пази своите
11 карти; другите доставчици са в новия раздел. Прост език, bg и en.
Защо абонаментите остават тук: те са на друга сесия; координаторът ги мести в свой раздел на „Връзки“.
Статус: решено от кодера.

## D-476 Azure с `api-key`; Vertex и облачните идентичности не са поставен ключ (04.11.2026)
Решение: проксито праща ключа на Azure в заглавка `api-key` (v1 API: `https://<ресурс>.openai.azure.com/openai/v1`).
AWS Bedrock е с Bedrock API ключ (bearer) на `https://bedrock-runtime.<регион>.amazonaws.com/openai`; човекът дава адреса.
Vertex иска OAuth токен за 1 час, затова е в каталога (`auth: gcp`), но не може да се добави (Q-096).
Източници: https://code.claude.com/docs/en/microsoft-foundry,
https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-mantle.html,
https://docs.cloud.google.com/vertex-ai/generative-ai/docs/start/openai (прочетени 04.11.2026). [НП]: Responses на Azure и Bedrock.
Тестове: proxy-upstreams.test.ts („Azure's api-key header“). Статус: решено от кодера.

## D-460 Един регистър на абонаментите: `SUBSCRIPTIONS` в packages/contract (04.11.2026)
Решение: `packages/contract/src/subscriptions.ts` държи по един запис на доставчик с абонаментен вход (zod
`SubscriptionProvider`): име, CLI (npm, версия, лиценз), headless форма, начин на вход (`paste_code` / `device_code` /
`browser_callback`) и неговите argv и хостове, командата за статус и как се чете (`claude-json` / `codex-text` /
`exit-code`), изход, папката на входа в контейнера и променливата към нея, допълнителна среда, CONNECT тунелите, адаптера
(`agent`), каталожния доставчик за моделите (`connectionProvider`), условията (`allowed` / `unclear` / `forbidden` +
линк) и наличност (`ready` / `untested` / `blocked` / `planned`). Volume-ът е `mandat-profile-<id>-<име>` (id без тире,
за да се чете еднозначно обратно). `canSignIn(id)` = ready/untested + има адаптер + условията не са против; само тези
стигат до вход (`LoginCliId` в `LoginStart`, `mandat login --agent`).
Четат го: `buildProfileArgs`/`profileVolume`/монтирането (packages/sandbox), тунелите на профила (packages/channels),
`listAccounts`/`loginCliOf`/`logoutProfile`/връзките (packages/cli), уебът (accounts, Настройки → Абонаменти, полето за
задача). Поведението за Claude и Codex е същото (снимките и тестовете на argv не са пипани).
Защо: Симо иска „колкото и каквито абонаменти“; досега Claude/Codex бяха разпръснати по 10 места като `codex ? … : …`.
Проучване на доставчиците: docs/integrations/subscriptions.md (04.11.2026).
Тестове: contract subscriptions.test.ts; sandbox connections.test.ts; cli accounts.test.ts.
Статус: решено от кодера.

## D-461 Статус на абонамент: влязъл / изтекъл / няма CLI / недостъпен (04.11.2026)
Решение: `subscriptionStatus` (contract): planned или липсващ образ → `no_cli`; не може да влезе (blocked) →
`unavailable`; иначе статус-командата казва „влязъл“ → `signed_in`, а ако не → `expired`. Изтекъл, защото volume
оцелява само след завършен вход (login-session.ts трие volume-а на незавършен нов вход) — значи е бил влязъл и входът
вече не важи. Харнесът не чете токена, за да знае истинската причина; картата предлага „Влез отново“.
Тестове: contract subscriptions.test.ts; web subscriptions-view.test.ts. Статус: решено от кодера.

## D-462 Настройки → Абонаменти: самостоятелен раздел и страница `/settings/subscriptions` (04.11.2026)
Решение: `apps/web/src/components/connections/subscriptions/` — `subscriptions-view.ts` (чисти карти и избор от
регистъра) и `subscriptions-panel.tsx` (карти с доставчик, кой, план, статус, „Влез отново“, „Махни“; „Добави абонамент“
→ избор на доставчик → съществуващият `AccountLogin` с `cli`). Недостъпните доставчици се виждат в избора, сиви, с
причина („условията не са ясни“, „програмата му още не е в пясъчника“). За ChatGPT подсказка да се включи входът с код за
устройство в ChatGPT (learn.chatgpt.com/docs/auth, 04.11.2026). Ред-линк в Настройки. Текстове bg/en (`subs.*`).
`AccountLogout` вече праща и `cli` (преди ChatGPT акаунт се махаше с Claude Code). Влезлият абонамент влиза в полето за
задача и в Модели през регистъра (`taskAgents`: `connectionProvider`, само при `canSignIn`) — без допълнителна стъпка.
Координаторът ще сложи панела в общата страница „Връзки“.
Проверено: страницата се отваря (dev сървър, фалшив control endpoint), bg и en, изборът и входът за ChatGPT.
Тестове: web subscriptions-view.test.ts, agents.test.ts. Статус: решено от кодера.

## D-463 Кои доставчици: Claude и Codex сега; Gemini спрян; Copilot, Kimi, Antigravity, Cursor, MiniMax планирани (04.11.2026)
Решение: по проучването (docs/integrations/subscriptions.md, 04.11.2026):
- Claude — ready; условията изрично позволяват човек да влезе в непроменения Claude Code, и когато платформа го хоства.
- Codex (ChatGPT) — untested: свързан докрай, входът с код за устройство трябва първо да се включи в ChatGPT.
- Gemini — blocked: от 18.06.2026 личните планове (free, AI Pro, Ultra) са в Antigravity CLI; Gemini CLI влиза само с
  Code Assist Standard/Enterprise, а условията пак не казват дали обвивка е позволена (Q-073, Q-090).
- Copilot CLI, Kimi Code, Antigravity, Cursor, MiniMax Code — planned: записи без команди (пясъчникът отказва
  помощен контейнер без команда), сиви в избора; спайкове в документа. Нито един CLI не е добавен в образа в тази
  сесия: Kimi Code е по-млад от 3 дни (правило 8); Copilot иска адаптер, собственически лиценз в allowlist и спайк за
  входа във файл без keychain — отделна задача (Q-091).
- Qwen Code не е абонамент вече (Qwen OAuth спрян на 15.04.2026, Coding Plan = ключ); Z.ai, DeepSeek, Kimi/MiniMax
  ключовете са в Ключове (D-392). iFlow е спрян; Amp/OpenCode/Pi са харнеси на трети страни, не CLI на доставчика.
Статус: решено от кодера; Симо може да обърне (Q-090, Q-091).

## D-464 Всеки абонамент е агент: `<cli>@<сметка>` за всички CLI от регистъра (05.11.2026)
Решение: Симо каза „всички давай“ (04.11.2026) — Copilot, Kimi, MiniMax, Cursor, Antigravity и Gemini с вход. Механизмът
вече не изброява claude/codex/gemini на ръка:
- `AGENT_CLIS` (packages/contract/agent-cli.ts) = идентификаторите на регистъра; `<cli>@<сметка>` се разпознава за всички,
  ключ и `+<връзка>` — само за `KEY_CLIS` (claude, codex, gemini). Дали абонамент може да тръгне решава `canSignIn` на
  регистъра (ready/untested, с адаптер, условията не са „forbidden“); иначе маршрутът е `unknown_agent` и нищо не тръгва.
- Каналът `<cli>-profile-<име>` носи `cli`; тунелите идват от регистъра. Пясъчникът монтира тома на `configDir` на CLI-то,
  средата е `configEnv` + `env` на записа + само тунелът на вратата (без ключ, без mdt_ токен — D-295).
- Моделът на сметка без запазени модели е `defaultModel` на записа; `default` = без флаг за модел (изборът на плана).
- CLI без собствен компилатор на профила получава само слоя на харнеса (цел `local`: инструкции + политика).
- Кодът за устройство се разпознава и като `code: XXXXXX` или `user_code` в адреса (Kimi) [НП: формата на кода].
Статус: решено от кодера; живата проба на всеки вход чака сметка (чеклист).

## D-465 Кои абонаменти тръгват: Copilot, Kimi, MiniMax, Cursor — да; Antigravity и Gemini с вход — не (05.11.2026)
Решение: по спайковете от 04–05.11.2026 (docs/integrations/subscriptions.md):
- GitHub Copilot CLI 1.0.105 — untested. Вход с код за устройство; без keychain и без TTY CLI-ят пази токена само ако
  `settings.json` казва `storeTokenPlaintext` — затова регистърът има „семе“: харнесът записва този файл в празния том
  преди входа (като стойност на env, не през скрипта). Статус: JSON-RPC `auth.getStatus` през пробата
  `mandat-copilot-status` (печата само да/не и login). Изход = изтриване на тома. Лиценз: собственически, образът е
  локален (4.1). Тунелите на плановете (api.<план>.githubcopilot.com) [НП].
- Kimi Code 2.4.1 — untested. Код за устройство, файл без keyring, статус = `provider list` (`managed:kimi-code`).
- MiniMax Code 0.7.4 — untested. Код за устройство (регион global), файл; данните за обучение са включени по
  подразбиране и само `config.yaml` ги изключва — това е семето му; `MCODE_DISABLE_EVAL_CAPTURE=1`.
- Kimi и MiniMax: условията пазят плана за „лично, интерактивно ползване“ — `terms: unclear`, UI предупреждава преди входа
  (по една задача, пусната от човек). Ако Симо реши „не“ — `availability: blocked` (Q-094).
- Cursor CLI 2026.10.22-27dcf5f — untested. Нов вид вход `link`: CLI-ят показва страница на cursor.com и сам чака
  потвърждението (без код); `LoginState.waiting_device.code` може да е null. sha256 на архивите е наш (Cursor не
  публикува). Тунел api2.cursor.sh; хостът на агента идва от сървъра [НП].
- Antigravity — blocked: §6 от условията брои софтуер на трети страни за достъп за нарушение; няма подкоманда за вход.
- Gemini с Google вход — остава blocked (Q-073, Q-090): само Code Assist; трябва втори root settings файл и pty.
Всички потоци и фикстури са възстановени от изходния код; първият жив рън на всеки CLI ги проверява (чеклист 36).
Статус: решено от кодера; Симо може да обърне (Q-094).

## D-480 Един кандидат за всеки източник на MCP сървър (04.11.2026)
Решение: всеки внос (поставен JSON, конфиг на клиент, GitHub, npm, официален регистър, Smithery, адрес) завършва в
`ImportCandidate` (`@mandat/mcp-bridge/import`): име, транспорт, пакет@точна версия или URL, хостове, **имена** на тайните,
`origin`, `problem`, `notes`, `findings`. От него `candidateRef` прави `McpServerRef`; кандидат с `problem` не се добавя.
Защо: един път към каталога значи един път към vetting-а (D-354) — никой източник не го заобикаля. Сравнение с Multica,
Paperclip, T3 Code, Smithery, Glama, PulseMCP, Claude Code, Codex, Gemini CLI, Cursor, OpenCode, Goose:
docs/integrations/tools-import.md (линкове, 04.11.2026).
Тестове: packages/mcp-bridge/src/import/import.test.ts.

## D-481 Поставен JSON и конфигът на Codex (04.11.2026)
Решение: приемаме `mcpServers` (Claude Code, Cursor, Gemini CLI), `servers` (VS Code), `mcp` (OpenCode), registry
`server.json` и единичен запис. stdio се приема само за `npx <пакет>`; `uvx`/`pipx`/`docker`/локален път → `not_npm`
(показва се, не се ползва — пясъчникът инсталира само npm, D-354). Допълнителни аргументи → `args_dropped`. Codex
`config.toml`: само таблиците `[mcp_servers.<име>]`, с малък четец на редове (без нова зависимост, правило 8).
Формати: https://code.claude.com/docs/en/mcp, https://learn.chatgpt.com/docs/extend/mcp?surface=cli,
https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md, https://opencode.ai/docs/mcp-servers/
(всички прочетени 04.11.2026).

## D-482 Стойностите на тайните от чужд конфиг никога не излизат от парсера (04.11.2026)
Решение: от `env`, `environment`, `headers`, `http_headers` се вземат само **ключовете** (имена на променливи); стойностите
не се копират в кандидата (TOML: заменят се с празно още при четене). Header на отдалечен сървър → бележка `needs_key`;
човекът въвежда ключа като запечатан `mcp:<име>` (както днес). Червен тест: стойността на тайна не се среща в нито един изход
(парсер, преглед, ред в базата).

## D-483 Мрежови източници: GitHub (заковано commit), npm (точна версия), Smithery (публичен запис за един сървър) (04.11.2026)
Решение: GitHub — `GET api.github.com/repos/<o>/<r>/commits/<ref|HEAD>` → SHA, после дървото и raw файловете на този SHA;
`server.json` → `package.json` (име+версия, ако е MCP пакет) → всеки `SKILL.md` под пътя (≤ 30). npm — `registry.npmjs.org`;
без версия → `dist-tags.latest`, сведено до число при вноса и показано; диапазон → отказ. Smithery —
`GET registry.smithery.ai/servers/<име>` (публичен, curl 04.11.2026); търсенето иска ключ (500 без него). Описанията на
туловете от Smithery се сканират още при вноса (`poisoned`). Отдалечен сървър без версия се записва като `0.0.0`; хешът на
туловете го заковава при vetting-а. Всичко се чете от уеб сървъра, никога от пясъчника; при добавяне сървърът чете отново
(прегледът на клиента не се приема на доверие).
Защо Smithery, а не Glama/PulseMCP: двата искат API ключ (Glama — и атрибуция), curl 04.11.2026.

## D-484 Внесено умение: сканира се, пази се текстът, влиза в профила само след одобрение (04.11.2026)
Решение: `SKILL.md` се сканира с правилата на `scanToolDefs` (невидими знаци, инструкции към модела, четене на `~/.ssh`);
находка → `blocked_reason`, и такова умение не може да се одобри (409). Пази се в `skills` (`source = 'user'`,
`content`, `content_hash`, `origin`, миграция 20261104000480). Одобрение (`tools.manage`) → `SkillRef` в слой E на всеки
одобрен профил на организацията (`profile_layer_version`). Работникът подава текстовете на одобрените (`catalogSkills`);
`skillTexts` пише само текст с одобрения хеш.
Тестове: import.test.ts (отровено умение), apps/web/src/lib/server/tools-import.test.ts.

## D-485 „Вече вързани“: само локално, само след съгласие, само списъците със сървъри (04.11.2026)
Решение: `discoverLocal` чете `~/.claude.json` (`mcpServers` и `projects[*].mcpServers`), `~/.cursor/mcp.json`,
`~/.gemini/settings.json`, `~/.codex/config.toml`, `~/.claude/skills/*/SKILL.md`, `~/.codex/skills/*/SKILL.md` — нищо друго
(никога `auth.json`, `.credentials`, `.env`). API-то отговаря само в локален режим (`MANDAT_LOCAL_OWNER`) и само с
`{consent: true}`. „Ползвай в Мандат“ = внос + одобрение в един клик (кликът е одобрението); MCP сървърът пак минава
vetting преди профила. Счупен конфиг → `unreadable`, не грешка.
Защо само локално: на хостван сървър „домът“ е на сървъра, не на човека.
Червен тест: тайна от чужд конфиг и имейлът от `~/.claude.json` не се връщат; auth файлове не се четат.

## D-486 Вграденият набор е включен без настройване (04.11.2026)
Решение: `proposeProfile` слага в слой E сървъра `mandat`, `RESEARCH_MCP_REF` (търсене, страници, документация) и уменията
`test-first`, `review`, `research`. Паметта идва с договора на задачата (D-400). Страницата ги показва като „Вградени —
включени“. Това отговаря на Q-080: Симо поиска вграден набор „напр. research, памет, fetch/docs“.
Цена: всяко пускане стартира sidecar-а на research; заявките за търсене напускат пясъчника (Q-081 остава).
Тестове: propose-layers.test.ts (снимките са обновени).

## D-487 Настройки → „MCP, инструменти и умения“ (04.11.2026)
Решение: самостоятелен компонент `apps/web/src/components/connections/tools/` и страница `/settings/tools`; `/tools`
пренасочва натам; ред-линк в Настройки. Едно поле „Добави от…“ разпознава какво е поставено (`detectSource`), човекът може
да смени източника; „Провери“ не записва нищо; „Добави и ползвай“ / „Добави, одобри по-късно“. Под тях: старите таблици
(живи сървъри, плъгини, разрешения, последни повиквания). bg и en.

## D-488 Gemini CLI засега не получава внесените MCP сървъри и умения (04.11.2026)
Решение: компилаторът за Gemini продължава да ги отчита като `unsupported`. Настройките на Gemini са в образа
(`/etc/gemini-cli/settings.json`, D-431), а файл с настройки под `/m` (собственост на агента) CLI-ят прескача. Claude Code и
Codex ги получават както досега (mcp.json / `[mcp_servers]`). Q-101.

## D-489 Каквото не взимаме сега (04.11.2026)
Решение: deeplink-ове (Cursor `cursor://…/mcp/install`, Goose `goose://extension`), плъгини/маркетплейси на Claude Code,
PyPI/OCI пакети, търсене в Smithery с ключ, Glama/PulseMCP. Записани в Q-102…Q-104.

## D-500 Настройки → „Връзки“: едно място за всичко вързано (05.11.2026)
Решение: най-горе в Настройки стоят пет плочки — Абонаменти, API ключове, MCP/инструменти/умения, Модели, Профил и синхрон.
Всяка показва какво е вързано сега (само факти: влязъл абонамент, запазен ключ или локален сървър, одобрен инструмент) и
води към своята страница. Изтекъл вход или блокиран MCP сървър дава „Чака теб“. Извън `pnpm local` локалните части
казват „Само в pnpm local“, никога „Още нищо“. Чиста функция `connectionTiles` (hub-view.ts), тест hub-view.test.ts.
Защо: Симо: ключовете ги нямаше в Настройки, а всичко беше по отделни страници. Сега четирите клона (D-460…D-499) се
виждат от едно място. Статус: решено от координатора; Симо може да го обърне.

## D-501 `@mandat/sync` е в харнеса (GPL) (10.11.2026)
Решение: пакетът за синхрон от незадължителния вход (D-491) е в `HARNESS_PACKAGES` на `scripts/license-groups.mjs`.
Защо: лицензът му вече е GPL-3.0-or-later, ползва само `contract` и `redaction`, и не е част от ядрото (присъда и дневник).
След сливането на connections-all тестът „всеки workspace пакет е в точно една група“ падаше. Статус: решено от координатора.

## D-502 Формата: харнесът е обвивка за всеки процес, Мандат е ядрото с гаранция след всяка сесия (10.11.2026)
Решение: харнесът (още без име, D-304) е обвивка около всеки модел (локален, API, абонамент) в пясъчника, в която
човекът е само архитект. Пет слоя около ядро: персонализация → процеси → способности → двигатели → Мандат. Мандат дава
след всяка сесия сигурно изпълнение, доказан резултат, печат на сесията в дневника и стълба на доверие по процес; нищо
навън (сливане, деплой, изпращане, плащане) без PASS. Проверката се разширява с верификатор за всеки вид резултат, не
само за код. Потребители са и разработчици, и хора без код (разширява PRD 2.4). Вграждат се всички процеси на
софтуерния бизнес (docs/prd/processes.md); викат се с разговор, команди/скилове и потоци на човека; персонализират се
говор и резултат, процеси, инструменти и самостоятелност. Първото доказателство е „идея → пуснат продукт“ със стъпки от
работата с клиент и поддръжката. От другите харнеси взимаме само идеи; кодът е наш.
Защо: Симо, интервю 10.11.2026: отделните задачи моделът ги може и сам; стойността е средата, персонализацията и
гаранцията за сигурни и проверени резултати след сесиите. Замества списъка с кандидат-задачи (docs/tasks/real-tasks.md,
махнат). Подробности: docs/prd/experience.md. Статус: решено от Симо.

## D-510 Пътища на Windows: хостът има буква на устройство, пясъчникът е POSIX (10.11.2026)
Решение: (1) `render.mjs` (`fixtureFile`) ползва `path.posix`: скриптът живее само в Linux контейнера, а `path` на
Windows хост даваше `C:\fx\…`. Пазачът срещу излизане от папката е същият на всеки хост. (2) Репортерът за `node --test`
пише имената на файловете с `/` на Windows, както vitest там (`C:/…/x.test.mjs`); в пясъчника не прави нищо.
(3) Тестовете очакват пътищата на хоста през `path.resolve`/`path.join` (browser, set-core-license, scripts), пускат
`pnpm` с `shell` на Windows (D-454) и подават репортера на node като `file://` URL (node не приема `C:\…` за модул).
(4) demo-replay: git в теста е с `GIT_CONFIG_NOSYSTEM=1` като всички други тестове; Git for Windows има
`core.autocrlf=true` в системния си gitconfig и `git apply` пишеше CRLF.
(5) `scripts/check-licenses.mjs` пуска `pnpm licenses list` с `shell` на Windows (там е `pnpm.cmd`, D-454); аргументите са
фиксирани низове, затова предупреждението DEP0190 на node тук не е риск.
Защо: това са грешки в тестовете или в кода, не разлика в поведението; на Linux нищо не се променя. Статус: решено от кодера.

## D-511 Права 0600/0700 на Windows: ACL на профила вместо POSIX режим (10.11.2026)
Решение: проверките `mode & 0o777` (connections-store, envelope, kek-keychain, mcp-isolation) остават на Linux/macOS,
а на Windows се пропуска само това твърдение (`if (process.platform !== "win32")`); останалото в теста върви.
Защо: на Windows няма POSIX права (`mode` е 0o666). Проверено с `icacls` на 10.11.2026: файл в `%USERPROFILE%` наследява
само SYSTEM, Administrators и самия потребител, а `MANDAT_HOME` по подразбиране е под профила. [НП]: ако някой сложи
`MANDAT_HOME` извън профила (напр. `C:\mandat`), ACL наследява правата на тази папка; явна ACL (`icacls /inheritance:r`)
не е направена — бъдеща задача. Статус: решено от кодера.

## D-512 Symlink-и в тестовете на Windows: junction; verifyd на Windows е named pipe (10.11.2026)
Решение: (1) mcp-allowlist, onboard scan и worker run правят връзката като directory junction към
`%SystemRoot%\System32\drivers\etc` (аналогът на `/etc`). За junction не трябват админ права или Developer Mode, а
`lstat`/`realpath`/node-tar го виждат като symlink, така че „не следва връзката“ и „export:symlink“ се проверяват реално и на
Windows. На Linux остават `/etc` и `/etc/passwd`. (2) Node на Windows слуша само на named pipe, не на път към файл, затова
`ipcPath(socket)` (mcp/backend.ts) дава `\.\pipe\mandat-verifyd-<16 hex от sha256 на пътя>`. На POSIX дава самия път.
verifyd и клиентът ползват една и съща функция, а `chmod 0660` е само на POSIX. (3) Неуспешен `listen` вече отхвърля
`startVerifyd`; преди висеше вечно (и тестовете висяха по 60 s).
Защо: без това verifyd.test.ts и mcp-isolation.test.ts висяха на Windows. Тестове: verifyd.test.ts („ipcPath…“,
„listen fails → the start rejects…“). [НП]: named pipe-ът е с подразбиращата се DACL на Windows (Everyone: само четене).
verifyd като отделен потребител е Linux услуга (systemd, docs/setup/verifyd.md); на Windows MCP върви в процеса (`--same-uid`).
Статус: решено от кодера.

## D-513 Property тестът на export: имената, които Windows не може да има (10.11.2026)
Решение: в „property: същият tree_sha навсякъде“ генераторът на имена изключва на Windows имената с точка или интервал
накрая и запазените имена (con, prn, aux, nul, com1…, lpt1…). На Linux/macOS домейнът е същият като преди.
Защо: истинската причина не беше бавен git, а името `_.`. Windows маха крайната точка и `git add` казва „unable to stat“.
fast-check свиваше примера дълго и тестът изтичаше. Сам тестът минава за ~40 s от своите 180 s. [НП]: агент, чието дърво
има такова име, ще получи грешка в износа на Windows хост; това не е проверено отделно. Статус: решено от кодера.

## D-514 Износът не виси, ако контейнерът за износ падне (10.11.2026)
Решение: в `run.ts` грешка от `runSandbox` на ролята `export` унищожава tar потока (`stream.destroy(e)`), така че
`exportChangeset` спира, а грешката стига до чакащите. Преди потокът оставаше отворен и `mandat run` висеше вечно.
Защо: така тестът „ExportRejection формат…“ изтичаше на Windows (symlink в фалшивия контейнер даваше EPERM). Истински
Docker, който умре по време на износа, би довел до същото. Тест: run.test.ts („export: a failing docker run ends the run
instead of hanging“). Статус: решено от кодера.

## D-515 doctor намира pnpm на Windows (14.11.2026)
Решение: `toolInvocation(cmd, platform)` в packages/cli/src/deps.ts; на win32 pnpm се пуска през shell (там е `pnpm.cmd`),
git — винаги без shell; аргументите са фиксирани, не идват от вход. Преди `mandat doctor` пишеше „pnpm missing“ на Windows.
Защо: намерено при живия тест на 14.11.2026. Тест: deps.test.ts. Статус: решено от кодера.

## D-516 `pnpm local` вижда порт, зает на всички интерфейси (14.11.2026)
Решение: `portFree` в packages/cli/src/commands/local.ts пробва 127.0.0.1, 0.0.0.0 и :: (IPv6 само); хост, който машината
няма (EADDRNOTAVAIL/EAFNOSUPPORT), не се брои за зает. Преди на Windows проверката казваше „port 3000 is free“, докато друг
проект държеше 0.0.0.0:3000, и http://localhost:3000 отваряше другия проект (Мандат слушаше само на 127.0.0.1).
Защо: намерено при живия тест на 14.11.2026. Тест: local.test.ts („portFree sees a port taken on all interfaces“).
Статус: решено от кодера.

## D-517 redteam: npm на Windows и сценарий, който хвърля грешка (14.11.2026)
Решение: R16 и mcp-sidecar.docker.test пускат `npm pack` през shell само на win32 (npm е npm.cmd; аргументите са
фиксирани пътища, не вход). `runRedteam` хваща грешка на сценарий: един неуспешен ред „crashed: …“ и infraError (exit 3),
останалите сценарии вървят и отчетът се печата. Преди ENOENT в R16 спираше целия `mandat redteam --json` без изход.
Защо: Docker тестовете на Windows, 14.11.2026. Тест: bench/redteam/index.test.ts.
Статус: решено от кодера.

## D-518 работно дърво от Windows checkout с CRLF (14.11.2026)
Решение: `mandat verify` (и MCP mandat_verify) взема проследен файл, записан с LF и изваден с CRLF (`git ls-files --eol`:
i/lf w/crlf, без -text/binary/eol=), с LF — както `git add` при core.autocrlf=true; всичко друго байт по байт. Git for
Windows задава autocrlf=true в системния си config, който чистият git на Мандат нарочно не чете, затова всеки файл
изглеждаше променен и недокоснатият .github/workflows/ci.yml даваше UNKNOWN D3:protected_path. CRLF→LF само маха \r
пред \n, не може да скрие код. Тестът mcp-verify.docker приема и CRLF в регулярния израз.
Защо: Docker тестовете на Windows, 14.11.2026. Тест: packages/verify/src/worktree.test.ts.
Статус: решено от кодера.

## D-519 R8 keyscan прескача node_modules на агентските CLI в /opt (14.11.2026)
Решение: r8-keyscan не обхожда `node_modules` под /opt (кодът на вградените CLI в образа). Пакетът на Kimi CLI носи
граматика за редактора (emacs-lisp-*.js) с низ, който съвпада с правилото за OpenAI ключ — фалшиво попадение, не ключ.
Ключ не може да стигне до /opt: той е код от образа, а тайните идват само през env и монтажи, които сканирането пак
обхожда (env, /m, /home/agent, /tmp, /etc, /opt без node_modules). node_modules на проекта се прескачат по същия начин.
Защо: redteam на Windows, 14.11.2026, R8 keyscan hits 1 (kind openai, /opt/kimi/node_modules/…). Тест: redteam R8.
Статус: решено от кодера.

## D-520 property тестът на export има 600 с на Windows (14.11.2026)
Решение: „property: същият tree_sha навсякъде“ (25 прогона, ~10 git процеса всеки) получава 600 с на win32 и остава
180 с другаде; прогоните не намаляват. На Windows стартът на процес е бавен и под пълния `pnpm check` тестът минаваше
180 с, а сам минава.
Защо: `pnpm check` на Windows, 14.11.2026. Статус: решено от кодера.

## D-521 „Сам довършва“: Мандат сам довършва чакания, които са таймер или повторен опит (14.11.2026)
Решение: чистата `nextMove` (packages/core/src/next-move.ts) казва за HELD/BLOCKED задача: wait до час, retry или ask.
Сам: channel_limit (до resets_at, без него — backoff), no_channel и agent_failed:rate_limited/overloaded/timed_out (backoff
10 мин · 2^n от влизането в HELD), base_moved (нов опит върху новия main), ci_failed („Поправи CI“ до ci_rounds от слой G),
FAILED без нерешим клас (POLICY/INFRA/HELD/E_*) — нов опит с бележка от Мандат (whatStopped + proposalFor, както нощем).
Таван: 2 опита сам на задача (по всички причини) и attempts_max. Никога сам: одобрения, ключове, tool_approval, UNKNOWN,
empty_change, head_moved, ревю коментари, спряна от човек (stopped), задачи от нощната смяна (те са на нощния тик).
`selfFinishTick` (apps/worker/src/online/self-finish.ts) върви до нощния тик на всеки 30 с (`MANDAT_SELF_FINISH=0` го
спира): нов опит = CREATED, retry_reason auto/ci, бележка task_activities kind 'self' (daemon-ът я слага в договора като
„Note from Mandat“), ledger task_retry {by: "mandat", why}. Ъпдейтът е пазен със state и attempt — човек, който е действал
междувременно, печели. Без нова схема и без миграция (retry_reason 'auto' и task_retry вече съществуват).
Защо: кръг 1, функция 1 (plan-round-1.md); одитът намери ~10 такива чакания от 28. Тест: next-move.test.ts,
self-finish.test.ts, self-ticker.test.ts, chat-feed.test.ts. Картата казва „Мандат сам пусна нов опит“ докато върви и „Мандат вече
пусна сам N опит(а)“ накрая. Жив тест 15.11.2026 (pnpm local, fake:delete-test, bugfix): опит 1 FAILED → опит 2 и 3 от
Мандат с бележка в договора → спря на тавана. Отворено: head_moved и apply_failed (approval) остават за човека, докато
няма повторна проверка без агент.
Статус: решено от кодера.

## D-522 инструкциите казват как се пускат проверките (14.11.2026)
Решение: instructions.md от профила (всички агенти) има раздел „Running the checks“: „Run `<test>` before you finish and
make it pass“ и „Run each check on its own, not chained with `&&`, `;` or `|`“. Headless Claude има право само на
командите от слой B точно както са записани; при живия тест на 14.11.2026 агентът пусна `sed … && npx vitest run`, беше
отказан и не пусна тестовете изобщо.
Защо: живият тест. Тест: compile.test.ts (D-522) и обновените снимки. Статус: решено от кодера.

## D-523 „Двойникът на собственика“ (15.11.2026)
Решение: Мандат се учи от твоите решения за одобрение и отказ. Не се учи от LLM. Работи на три стъпки:
1. Сянка. За всеки опит, който чака одобрение, двойникът записва една прогноза в `twin_predictions`. Прогнозата
   идва от претеглените ти решения в същия клас (repo|вид|агент|причина); тежестта на решение пада наполовина за
   30 дни. Втори фактор е отделна причина (`approval_2fa`). При под 3 решения или под 70 % мнозинство двойникът се
   въздържа. Когато решиш, прогнозата получава оценка. Одобрение на самия двойник никога не го учи.
2. Предложение. Клас с ≥ 8 оценени прогнози и долна граница по Уилсън ≥ 0,8 се предлага ВЕДНЪЖ на картата на
   задачата. Границата е едностранна, 95 % (z = 1,645), затова първата редица без грешка, която минава, е 11 от 11.
   Отказът е правило, изключено веднага, и не се предлага отново.
3. Действие. Приемането иска approve.rules, втори фактор, готов клас и одобрен профил. Правилото е вързано за
   profile_hash. След това двойникът одобрява сам през `private.approve_changeset` от името на собственика на
   правилото, с method и client 'twin', до 5 пъти на седмица. Одобрява само VERIFIED промени без втори фактор, на
   ниво ≤ 1 и при прогноза „approved“, докато точността на класа е ≥ 0,8. Базата отказва 'twin' навсякъде, където
   се иска втори фактор. Всяко решение на двойника се записва в дневника като `twin_decided`, а всеки отговор на
   собственика като `twin_rule`. Изключването и отказът стесняват, затова стига и одобряващ.
Никога сам: ключове, TOTP, права, UNKNOWN, MCP и умения, нощни задачи, отказ, връщане на main.
Защо: plan-round-1.md, функция 2. Схемите (contract/src/twin.ts, миграция 20261115000523_twin.sql) са одобрени от
Симо на 15.11.2026. Връщането на main след провал остава за следващия кръг (решение на Симо).
Тестове: contract twin.test.ts, core twin.test.ts (21), worker twin.test.ts, cli twin-ticker.test.ts, web
twin.test.ts. MANDAT_TWIN=0 спира тика. Статус: решено.

## D-524 Екраните като истински продукт: без име, без демо, падащи менюта в наш дизайн (15.11.2026)
Решение:
1. Нито един текст на екрана не казва „Mandat“/„Мандат“. Продуктът още няма име (D-304), а „Мандат“ беше работно име.
   Текстовете казват какво става: „Резултатът се проверява“, „Проверката отхвърли промяната“, „Какво е проверено“.
   Лентата на проверката в нощния план и в работната маса се казва „Проверка“. Команди и файлове (`pnpm mandat`,
   `.mandat.yml`) не са име и остават. Тест: i18n/no-brand-name.test.ts.
2. Примерът в полето за задача и подсказката за първа задача не сочат към демо проекта или към демо агентите.
3. Всички падащи менюта (23) са един общ компонент `Select` (components/select.tsx) вместо родния `<select>` на браузъра.
   Той следва токените на приложението и е listbox с клавиатура: стрелки, Home/End, Enter, Esc, търсене по първа буква.
   Тест: select.test.ts. Двата e2e теста, които ползваха `selectOption`, кликат бутона и после реда.
Остава: името в приложението за вход (auth-server appName) и издателят в TOTP още казват „Mandat“. Демо проектът
(`mandat-demo/shop`) още се създава от `pnpm local`. Решението за първото пускане без демо проект чака Симо.
Защо: Симо, 15.11.2026: „навсякъде виждам мандат, демо… искам да бъде като реален продукт“; „дропдаунът е изключително
грозен, нека е наш дизайн“. Отговор на въпроса за името: „без име“. Статус: решено от Симо.

## D-525 Без демо проект при първото пускане (15.11.2026)
Решение: `pnpm local` създава демо проекта (`mandat-demo/shop`) само с ключа за демо (`MANDAT_DEMO_AGENTS=1`). Без него
има собственик, организация и канали, но не и проект: `seedLocal`/`seedMinimal` без `remoteUrl` не правят хранилище.
Правилото за насочване е за цялата организация (repo_id null). При съществуваща база полето за задача не предлага демо
проекта без ключа (lib/projects.ts `taskProjects`). Без проект бутонът „Start“ е изключен и полето води към „Add project“.
Старите задачи по демо проекта остават в списъка като история.
Защо: Симо, 15.11.2026: „да, махни го“ (продължение на D-524, екраните като истински продукт). Тестове:
seed.test.ts (D-525), projects.test.ts. Статус: решено от Симо.

## D-526 „Добави проект“ без писане на път: намерени проекти и разглеждане на папки (15.11.2026)
Решение: в браузъра страницата „Добави проект“ показва две неща.
- **Твоите проекти:** git проекти, намерени на обичайните места: Desktop, Documents, code, projects, src, repos, dev,
  source/repos, GitHub и home, на дълбочина 2. Търсенето спира при 50 проекта или след 1,5 s.
- **Разглеждане:** папките от home надолу, с бутон „нагоре“, пътека и дискове. Git папките имат бутон „Добави“.
Ръчният път остава отдолу. Списъците ги прави локалният CLI през control endpoint-а: GET /folders и GET /folders/found,
със същия bearer и само на 127.0.0.1. Връщат само имена и пътища. Не следват symlink-ове и junction-и, прескачат
скрити и системни папки и никога не предлагат MANDAT_HOME. Уебът ги чете с право projects.manage. Десктопът си остава
с родния диалог (pickFolder).
Защо: Симо, 15.11.2026: „да може да се избере папка, да няма потребителят да търси“. Тестове: folders.test.ts,
local-control.test.ts, contract local-control.test.ts, folder-path.test.ts, keys.test.ts. Статус: решено от Симо.

## D-527 Правилата на локалното демо отиват в main; живият тест на двойника (16.11.2026)
Решение: одобрените правила на проект с доставчик `local` се записват в main на огледалото му, като commit
„mandat: harness vN“ с fast-forward. Това важи и за локалното демо (`mandat-demo/shop`). По същия начин в огледалото
влизат и задачите му (D-367). Досега демото носеше името на GitHub демото на работника. Затова правилата му отиваха
като PR във фалшивия GitHub, а него никой не слива. След одобрението всяка следваща задача спираше с `harness_stale`.
Защо: живият тест на D-523 на 16.11.2026. Тест: harness-local.test.ts.
Живият тест на двойника (D-523), на `pnpm local`, с Claude през абонамента:
- сянката, оценката и картата работят;
- собственикът прие правилото от картата с „Yes, let it decide“;
- задача `t_mwjj2wcgda937dff` („author“ в package.json) мина проверката (VERIFIED) и зачака одобрение;
- до 30 секунди двойникът я одобри сам: method и client `twin`, от името на собственика на правилото;
- в дневника има `twin_decided` с n=13 и lower=0,816; промяната влезе в main (134ec91);
- картата показва „Your twin approved this by itself…“ и бутона „Turn the rule off“.
Отделно:
- нощните задачи вече наследяват `created_by` от смяната си и получават паметта на собственика;
- `mandat accounts` казва „не мога да проверя“, когато липсва образът на пясъчника;
- формата на двойника пази номера на задачата, ако страницата е заредена със стар JavaScript.
Статус: решено.

## D-528 Страница с метрики (втори кръг, 16.11.2026)
Решение: `/metrics`, с връзка от „Общ преглед“. Страничното меню остава с четирите си раздела (D-403). Периодът е
7 или 30 дни. Четири плочки:
- приети промени от завършените задачи;
- „без теб“: приети без решение на човек, с броя на одобренията от двойника и на новите опити, пуснати сами;
- цена на приета промяна: цялата цена за периода, с неуспешните, делена на приетите. Ако задачите вървят през
  абонамент, цена няма и вместо $0 се показва „—“;
- точност на двойника: оценените му прогнози за цялото време, без собствените му одобрения.
Под плочките има графика на приетите промени за последните четири седмици, без теб и с теб, с легенда и таблица.
Задача се брои за завършена, ако:
- има ред `delivered` в дневника: тогава е приета;
- е отказана, спряна или изтекла;
- е BLOCKED: тогава е неуспешна.
Отговорен въпрос без промяна не се брои. Решение на човек е:
- одобрение или отказ, които не са от двойника;
- `task_retry` или `task_stopped`, където `by` е потребител.
Новите опити, пуснати сами, се броят от дневника (`by: mandat`), защото роля viewer не вижда бележките.
Чистата част е в lib/metrics.ts, а четенето от базата е в lib/server/metrics.ts. Четенето е от името на човека
(RLS). Тестове: metrics.test.ts (7) и server/metrics.test.ts (2). Статус: решено.

## D-529 Памет с време (втори кръг, 16.11.2026)
Решение: без нови колони. Всеки спомен е валиден от `created_at` до `invalid_at`. Историята му в `memory_events`
показва какви са били текстът и статусът във всеки момент: създаден, редактиран, одобрен, архивиран, върнат,
слят или заменен.
- `memoryAsOf` в packages/memory прилага тази история до дадена дата. На страницата на паметта е полето „Към дата“
  (`?at=ГГГГ-ММ-ДД`): паметта, каквато е била в края на този ден, само за четене, с връзка „Към днес“.
- `staleAgainstRepo` проверява активните проектни спомени срещу main на проекта. Ако спомен споменава файл, който го
  няма, или скрипт, който липсва в package.json (`pnpm x`, `npm run x`), той е маркиран „може да е остаряло“ и
  причината се показва. Нищо не се променя само: решава човекът. URL адреси, номера на версии и вградени команди на
  pnpm не се броят.
- Файловете и скриптовете на проекта се четат от огледалото на този компютър (`repoFacts` в работника). Проект извън
  компютъра не се проверява.
Защо: plan-round-1.md, втори кръг. Тестове: temporal.test.ts (5), repo-facts.test.ts (2), memory-time.test.ts (2),
memory-view.test.ts. Проверено на живо: правилен спомен, остарял скрипт `typecheck`, изглед към вчерашна дата.
Статус: решено.

## D-530 Профилът се развива с доказателства (втори кръг, 16.11.2026)
Решение: един клас провал, който се повтори в ≥ 3 задачи от един вид за 30 дни, става опит за промяна на профила
(`profile_trials`). Промяната е едно от четири фиксирани стеснявания и никога не е текст от LLM (PRD-9):
- D2 (изтрит, пропуснат или отслабен тест) → граница в слой B, че тестовете не се пипат;
- D8 lint → кука `lint-changed`;
- D8 типове → кука `typecheck-changed`;
- D4 или D3 за път → забрана за писане в този път (слой C).
Манифестът пази доказателствата (задачите) и прогноза: класът няма да се върне в следващите 10 задачи от този вид.
Вратата е bench: едни и същи сценарии за договора на вида задача (free или bugfix), с текущия и с променения профил.
- Ако резултатът е по-лош (по-малко pass или повече фалшиво VERIFIED), опитът е отказан.
- Ако не е по-лош и `isNarrowing` е вярно, Мандат приема промяната сам: нова одобрена версия, старата става
  superseded, а `profile_change` и `profile_trial` се записват с `by: mandat`.
- Ако промяната не е стесняване, чака човек. Четирите правила винаги стесняват, затова това на практика не става.
Правилото на двойника следва стесняването и хешът му се премества заедно с версията (избор на Симо). Когато човек
промени правилата, правилото на двойника пак спира.
Ако следващите задачи опровергаят прогнозата, промяната се връща сама към старите слоеве и опитът става rolled_back.
Една и съща промяна не се предлага втори път. Тикът върви във фона на работника на всеки 30 минути и никога два пъти
наведнъж. След грешка спира за 6 часа. MANDAT_EVOLVE=0 го изключва; MANDAT_EVOLVE_BENCH=0 оставя опитите
предложени, без bench.
На страницата с проекти е разделът „Сам стеснява правилата“.
Защо: plan-round-1.md, втори кръг; PRD 6.11; autonomy-research.md (AHE, разделяне по вид задача). Схемите са
одобрени от Симо на 16.11.2026.
Тестове: contract evolve.test.ts (3), profile evolve.test.ts (7), worker evolve.test.ts (3), bench
run-bench-trial.test.ts (2), cli evolve-ticker.test.ts, web evolve.test.ts. Статус: решено.
Живата проверка на 16.11.2026, на `pnpm local` с демо проекта:
- три bugfix задачи с изтрит тест (`fake:delete-test`) дадоха опит `tests_kept||bugfix`;
- bench мина с 28/28 преди промяната и 28/28 след нея, без фалшиво VERIFIED. На Windows отне около 37 минути;
- Мандат прие промяната сам. Профилът стана версия 3 с новата граница, правилото на двойника премести хеша си, а в
  дневника има `profile_trial` accepted и `profile_change` evolve;
- страницата с проекти показва промяната с доказателствата, прогнозата и резултата от bench.
Хванато преди живата проверка: изтритият тест носи и `D4:out_of_contract:tests/**`. Затова пътищата към тестове не се
предлагат за забрана: bugfix ги държи навън по договор, но feature задачите трябва да пишат тестове.

## D-531 Разговор без пясъчник (E10а ф. 1, 17.11.2026)
Решение: полето за задача има два режима. „Питай първо“ е по подразбиране, „Работи веднага“ е запомнен избор
(`taskMode` в предпочитанията на `mandat local`; PUT `/api/preferences` праща само сменения ключ, `mandat local` го слива
със записаните). „Работи веднага“ е точно днешната задача.
При „Питай първо“ съобщението отива в `conversations` и `conversation_turns` (миграция 531, RLS: членовете четат,
пише само сървърът). Работникът го взима (`conversationLoop`, отделно от задачите и проучванията) и отговаря през
модела на избрания агент:
- API ключ (`claude`, `codex`) и запазена връзка (`claude+<id>`, `codex+<id>`, вкл. локален модел като Ollama): през
  llm-proxy с mdt_ токен на разговора. Бюджет 0,50 $, срок 120 мин, едно run id за целия разговор, затова проксито брои
  всичко срещу един бюджет. Без контейнер и без процес.
- Абонамент `claude@<акаунт>`: непромененият Claude Code в малкия контейнер на профила (`profilePrintExec`, D-295). Това
  е единственият законен път за абонамент (Ф5 ще търси път без Docker).
- Демо агентите (`fake:*`) отговарят по скрипт, без ключ.
- Gemini и други абонаменти още не се поддържат в разговора. Разговорът спира с ясна причина.
Моделът има точно три инструмента: `ask_user` (≤ 3 въпроса; по-дълъг списък се реже), `search_memory` (само чете
активната памет) и `propose_brief`. Последният само показва задание: цел, засегнати части, какво не се пипа, кога е
готово. Инструмент за писане, команди или мрежа няма. Непознат инструмент се пренебрегва.
Паметта се пише само от ред „запомни:“ / „remember:“ на човека, както в задача (D-400).
Изчерпан бюджет, изтекъл срок, претоварен доставчик и грешка са отделни състояния. При претоварване човекът избира
друг агент или модел и натиска „Опитай пак“.
„Започвай“ се вижда през целия разговор. Той прави днешната задача през `createTask` (без втора логика) с текст:
заданието, ако има, и думите на човека. После фазата на разговора става `work`.
Отговорът идва по SSE (`/api/conversations/:id/stream`). Общият помощник `sse.ts` вече служи и на проучванията.
Избори при неясно:
- моделът на разговора е агентът от полето за задача, а не `model_channels`. Каналите на локалното демо са само демо
  ключове, а Симо тества с абонамента си;
- инструментите са JSON протокол в отговора, защото `ModelClient` няма tool calling;
- потокът носи цели ходове, а не токени, защото `ModelClient` не стриймва;
- заданието в Ф1 не се редактира и не се одобрява; това е Ф2.
Защо: e10a.md, Фаза 1 и твърдите правила 1, 2, 4 и 7; experience.md, Ф1. „hi“ трябва да получи отговор под 10 s, без
контейнер.
Тестове: contract conversation.test.ts (6), worker conversation.test.ts (12; без процес и без Docker по пътя на ключ и
локален модел, проверено с капан на `node:child_process`), web conversation.test.ts (4), cli connections.test.ts
(сливане на предпочитанията), web connections-api.test.ts. Живата проверка (17.11.2026, `pnpm local`, Claude през абонамента): „hi“ получи отговор; описание на промяна
получи предложено задание за ~13 s (малкият контейнер на профила), без задача. Две поправки от нея: „Изпрати“ не иска
проект (само „Започвай“ иска), а авто-превъртането е с блоково тяло, защото новият Chromium връща Promise от
`scrollIntoView` и React го викаше като почистване („i is not a function“). Статус: решено.

## D-532 Договорите на процеса за тежки задачи (М1 Х0, 17.11.2026)
Решение: `packages/contract` получава договорите на процеса от docs/prd/heavy-process.md, а `packages/core` — чистото
решение за профила.
- `task-profile.ts`: `TaskAxes` — шестте оси (код, еталон, делимост, доказ, риск, размер); всяка приема `"unknown"`.
  Еталонът е `none` или `{kind: old_system|reference_impl|standard, locator}`; доказът е непразен списък без повторения
  (`ProofKind`). `TaskProfileId` (10 профила, вкл. `other`), `OracleKind`, `ProfilePlan`, `TaskProfile`, `AXIS_NAMES`.
- `task-spec.ts`: `AcceptanceCriterion` (id `AC-<n>`, `when`, `shall`, `proof`), `Spec` (≥ 1 критерий, уникални id,
  непроменено, извън обхвата, профил), `specHash`; `untestableCriteria`; `OracleManifest` (скрити тестове с път и
  sha256, диференциален, e2e, червено на базата, одобрение), `oracleHash`; `WorkUnit`, `Handoff`, `SessionSeal`.
  Хешовете са JCS + sha256 (`hashJcs`), както договорът (D-122).
- core `task-profile.ts`: `deriveProfile(axes, hint?)`, `unknownAxes(axes)`, `PROFILE_NAMES`, `PROFILE_UNITS`.
Правила на `deriveProfile`:
- Профил се назовава само при ясно съвпадение по известните оси (първото вярно): еталон old_system/reference_impl →
  migration; код + стандарт + висок риск → hardening; код, без еталон, доказ differential → refactor; без код, без
  еталон, доказ само numbers/human → research; без код, без еталон, размер l/xl, доказ tests/ui → new_product; код,
  без еталон, tests/ui без differential → feature. Иначе `other`.
- upgrade, tests и infra не се различават по осите, затова идват само от `hint` (предложението на модела в Х1), и то
  само ако известните оси не му противоречат; `"unknown"` никога не противоречи. Противоречив hint се пренебрегва.
- Планът винаги идва от осите: работа с код (всичко освен research) → hidden_tests и mutation_graded (оракулът се
  проверява с мутации, §3); еталон или доказ differential → differential; ui → e2e; висок риск или действие навън →
  exploit и human_review; доказ human → human_review; research → citations. Делимост yes → waves; размер l/xl → пилот.
  Неизвестна ос не добавя нищо: планът е окончателен чак когато `unknownAxes` е празен.
Избори при неясно:
- `untestableCriteria` е нарочно просто и детерминистично: празен или само интервали `when`/`shall`, или доказ
  `human` в профил, който иска машинна проверка (всички без research и other). Неясните думи са работа на интервюто.
  Затова схемата допуска празни `when`/`shall` (чернова), а функцията ги хваща.
- `oracleHash` не включва `approved`: одобрението подписва хеша на съдържанието, затова не може да е част от него.
  `specHash` хешира цялата спецификация.
- `SessionSeal.verdict` е `VerdictResult` (VERIFIED/FAILED/UNKNOWN), не целият `Verdict` на опит: печатът е за цялата
  сесия, а опитите са в `result_ref` и дневника (`ledger_head`).
- Пътищата на скритите тестове са относителни, с `/`, без `..`: те са в дървото на оракула, не в хранилището.
- `unknownAxes` е в core (чиста функция до `deriveProfile`), имената на осите (`AXIS_NAMES`) са в договора.
- Имената на профилите са на английски като останалия код; UI-то ще ги превежда.
Защо: docs/prd/heavy-process.md, §0 (шестте оси и профилите), §2 (критерии КОГА…ТРЯБВА, хеш в печата), §3 (скрит
оракул с контролна сума и одобрение), §6 (бележка за предаване), §8 (печат: какво е проверено и какво не). Х0 е
основата на М1; без общ договор Х1–Х3 биха измислили интерфейси (AGENTS.md, правило 11).
Тестове: contract task-profile.test.ts (6), task-spec.test.ts (11) — кръгове и отхвърляния, стабилен хеш при друг ред
на ключовете; core task-profile.test.ts (21) — таблица за всеки профил вкл. other, hint, планът, unknownAxes.
Статус: решено.

## D-533 Прием, интервю и спецификация в разговора (М1 Х1–Х2, 17.11.2026)
Решение: разговорът от D-531 става приемът и разбирането на процеса за тежки задачи (docs/prd/heavy-process.md §0–§2).
- Интервю без таван. `ask_user` приема колкото въпроса трябват; остава само предпазна граница от 50 на едно съобщение
  (`CHAT_QUESTIONS_LIMIT`), не таван на интервюто. Това отменя правило 2 на e10a и рязането до 3 от D-531. Системният
  промпт казва: питай точно каквото трябва, докато всяка ос е известна и всеки критерий е проверим, и никога не питай
  това, на което хранилището отговаря.
- Четене на хранилището от разговора: `list_dir`, `read_file` (до 128 KiB, до 400 реда на четене, с номера на редове),
  `grep` (фиксиран низ, само текстови файлове, до 60 резултата). Всичко е от git обектите на `refs/heads/main` в
  огледалото на избрания проект на този компютър (file://, както repo-facts). Пътят се нормализира и затваря
  (абсолютен, `..`, буква на диск, `:` магия → отказ; `--literal-pathspecs`). Връзка (mode 120000) и подмодул се
  отказват, затова символна връзка никога не се следва. Отказват се `.env*`, ключове и пълномощия (`id_*`, `*.pem`,
  `*.key`, `.npmrc`, `credentials*`, `secrets*`, папки `.ssh`, `.aws` и др.), двоични файлове и всичко, в което
  packages/redaction намира тайна; в `grep` такива редове се броят като „withheld“. Проект, който не е на този
  компютър (друг remote или липсващо огледало) → всеки инструмент казва това. Инструмент за писане, команди или мрежа
  няма. Единственият процес е `git` (cleanGit) върху огледалото и само при извикване на инструмент.
- Съдържанието на файл живее само в един отговор (за модела). Записаният ход `tool` казва какво е направено (път,
  „lines 1-40 of 600“, причина за отказ), никога съдържанието; логът е само id и статус.
- `propose_axes`: моделът предлага `TaskAxes` и по желание hint; сървърът пуска `deriveProfile` + `unknownAxes` и пише
  ход `axes` и колоните `axes`, `profile`, `unknown_axes` на разговора. Моделът вижда в `<state>` профила и
  неизвестните оси и продължава да пита, докато има такива.
- `propose_spec`: сървърът проверява `Spec` със zod и `untestableCriteria`; профилът на спецификацията е изведеният
  (моделът предлага, детерминистичната проверка решава). Спецификацията е „готова за одобрение“ само когато няма
  неизвестна ос и няма непроверим критерий; иначе моделът получава списъка и продължава. Без предложени оси всички
  шест са неизвестни. Грешна схема се връща на модела като проблем, не се губи. Готова спецификация приключва отговора.
- `propose_brief` остава както е (обратна съвместимост, за малка промяна); не се превръща в Spec, защото Brief няма
  критерии КОГА…ТРЯБВА и не може да се одобри като спецификация.
- Одобрение: `POST /api/conversations/:id/approve` с `{spec_hash}`; само човек със сесия, CSRF и произход, с
  възможността `approve.level1` (собственик, одобряващ; `private.has_cap` с обхвата на проекта, като `roleCan`).
  Хешът трябва да е този, който човекът е видял, и да е хешът на записаната спецификация (иначе `spec_changed` /
  `spec_not_ready`). Записва `approved_spec`, `approved_spec_hash`, `approved_by`, `approved_at` и ред `spec_approved`
  в дневника с `{conversation, spec_hash, profile, by}` — без текст на спецификацията. Моделът няма инструмент за
  одобрение; непознат инструмент се пренебрегва. Нова спецификация с друг хеш маха одобрението.
- „Започвай“ с одобрена спецификация (хешът се сверява отново) прави днешната задача през същия `createTask`, с текст
  `specText` (цел, профил, критерии „AC-n: WHEN … THE SYSTEM SHALL … (proof: …)“, непроменено, извън обхвата, после
  описанието до 4000 знака) и `tasks.spec_hash`. Работникът го слага в запечатания договор (`Contract.spec_hash`,
  незадължително поле, влиза в `contract_hash`, агентът не го вижда) и в реда `task_created` на дневника. Без одобрена
  спецификация „Започвай“ е точно D-531 (задание и думите на човека).
- Миграция 533: колоните на разговора, нови видове ходове `tool`, `axes`, `spec`, граница на хода 256 KiB,
  `tasks.spec_hash`. RLS както в D-531: членовете четат, пише само сървърът.
- UI (минимално, ще се прави наново): ред за прочетеното, карта с профила и неясните оси, карта на спецификацията с
  критериите, „Не се променя“, „Извън обхвата“, състояние (не е готова / готова / одобрена / заменена) и бутон
  „Одобри спецификацията“ само на текущата готова спецификация за човек, който може да одобрява.
Избори при неясно:
- „Отказвай всичко, което redaction хваща“ е буквално: файл с какъвто и да е удар (и ентропия) не се чете; така
  понякога се отказва безобиден файл с дълъг хеш, но никога не изтича тайна.
- `.env.example` също се отказва (правилото е `.env*`), макар да има само имена.
- Извиквания на модела за едно съобщение: 8 (четене и проверка на спецификация искат няколко), бюджетът 0,50 $ остава
  истинската граница.
- Съдържанието на прочетен файл не се пази между съобщенията; моделът чете пак при нужда. Цена: повече токени;
  полза: нищо от хранилището не остава в базата.
- Одобрената спецификация се пази отделно (`approved_spec`), макар при еднакъв хеш да е същата като `spec`, за да е
  ясно какво точно е подписано.
Защо: docs/prd/heavy-process.md §0 (шестте оси, моделът предлага, проверките потвърждават), §1 (интервю без таван,
опознаване само с четене), §2 (критерии КОГА…ТРЯБВА, непроменено, одобрение от човек, хеш в печата); AGENTS.md
правила 2, 4, 5 (нищо от .env, ключове и съдържание в логовете).
Тестове: contract conversation.test.ts (8; инструментите, без таван, ходовете без съдържание, specText, тялото на
одобрението), contract.test.ts (spec_hash в печата, агентът не го вижда); worker repo-tools.test.ts (7; затваряне на
пътя, бягство, връзка, .env*, ключове, тайна по redaction, двоичен, голям, grep с отказани редове, проект не на този
компютър), conversation.test.ts (18; 12 въпроса остават 12, неизвестни оси продължават интервюто, непроверим критерий
не е готов, лоша схема се връща, инструментите за четене, съдържанието не се пази и не се логва, нова спецификация
маха одобрението, моделът не може да одобри), daemon.test.ts (spec_hash в договора); web conversation.test.ts (+5;
наблюдател не може да одобри, стар хеш, неготова, ред в дневника с хеша без текст, „Започвай“ носи хеша до задачата и
договора, без одобрение — D-531, пътят с CSRF), conversation-spec.test.ts (2; картата и бутонът). Без жив модел: живата
проверка остава за Симо.
Поправка от живата проверка (17.11.2026, Claude през абонамента, local/luxproof): след `read_file` отговорът на
модела започна с XML блок `<invoke name="list_dir"></invoke>`, после JSON, ред „Correction:“ и JSON отново. Старият
четец взимаше от първата до последната `}`, не успяваше и показваше суровия текст като отговор; извикването не се
пускаше и разговорът спираше. Сега:
- важи само JSON протоколът: от текста се взимат всички цели `{…}` обекти (скобите в низове се пазят), валидният
  последен печели (моделът, който се поправя, иска последната си дума); XML тагове (`invoke`, `parameter`,
  `function_calls` и др.) се махат и никога не се изпълняват, и от `say`;
- текст без протокол (без скоби, тагове, `"tool":` или „Correction“) е думите на модела, както преди;
- нечетим отговор получава един кръг за поправка („answer again with ONE JSON object“); кръгът не харчи стъпка, така
  че извикване от него се пуска и цикълът продължава и на последната стъпка; бюджетът и срокът се проверяват преди него;
- ако и след поправката няма нищо четимо, ходът е `assistant` с `unreadable: true` и без текст; екранът показва кратко
  съобщение („Отговорът на модела не можа да се прочете…“), никога суровия текст.
Тестове: worker conversation.test.ts (+5; живият отговор дословно: list_dir се пуска и в нишката няма XML, JSON и
„Correction“; поправка с валидно извикване; поправката на последната стъпка; два пъти нечетимо → unreadable),
contract conversation.test.ts (+1), web conversation-spec.test.ts (+1).
Статус: решено.

## D-534 Оракулът: скрити приемни тестове от отделен агент, проверени преди писателя (М1 Х3, 17.11.2026)
Решение: след одобрена спецификация човек натиска „Направи оракула“; отделен агент пише скритите приемни тестове по
критериите; оракулът се проверява върху сегашния код, човек го одобрява и чак тогава „Започвай“ пуска писателя, чийто
резултат се съди и с тези тестове (само в дърво B), и с мутации на променения код (docs/prd/heavy-process.md §3).
- Задействане: изричното действие „Направи оракула“ (`POST /api/conversations/:id/oracle`), не самото одобрение на
  спецификацията. Защо: оракулът харчи бюджет на агент и човекът решава кога; същото действие прави оракула наново,
  когато предишният не е готов или не е тръгнал. Изисква `canAct`, одобрена спецификация (хешът се сверява пак), план с
  `hidden_tests` (`deriveProfile` върху осите на разговора; без оси — `PROFILES_NEED_TESTS`), и никой оракул в строеж
  или одобрен за същия хеш. Иначе `spec_not_approved`, `oracle_not_needed`, `oracle_building`, `oracle_approved`.
- Задачата на оракула: `tasks.kind = 'oracle'` през същия `createTask` и същия `processTask` (същото втвърдяване,
  mdt_ токен, изход през гейта). Текстът е `oracleTaskText(spec)`: само нови тестови файлове под `tests/__hidden__/`,
  всеки тест започва с id: `AC-n:` за критерий (трябва да е червен на сегашния код) и `U-n:` за n-тото непроменено
  поведение (трябва да е зелен); нищо друго не се променя. Договорът: `allowed_paths = ["tests/__hidden__/**"]`,
  `may_change_tests = true`, `spec_hash`. Агентът на оракула не получава скрити тестове. Етикетът се чете от името на
  теста или на describe блок (`oracleTag`).
- Изходът не се доставя: няма changeset, ред с diff, клон, PR или промяна в огледалото. След износа `runTask`
  (`i.oracle`) прилага промяната към чист клонинг на базата, взима файловете под папката на оракула и, ако промяната е
  само тестове, ги пуска върху базата в собствен run (`<runId>-oracle`: нов volume и гейт, тестове с `--network none`;
  `runOracleOnBase`/`oracleFromChange` в packages/verify, същата машина като дърво B). Файл извън папката или не-тест →
  `non_test_change`, нищо не се пуска. След това `diff.patch` и `verify/report-b.json` на run-а се трият.
- Класификация (чиста, core `classifyRedOnBase`): всеки критерий с доказ, различен от human, иска ≥ 1 тест с неговия
  id и всички да падат; всяко непроменено поведение иска ≥ 1 тест `U-n` и всички да минават; всеки тест има известен
  етикет. Иначе не е готов, с причините: `untagged_criterion`, `green_on_base`, `unchanged_untagged`, `unchanged_red`,
  `untagged_test` (брой), `unknown_tag`, `not_run`, `no_tests`, `non_test_change`. Причините носят id на критерий и
  броеве, никога име на тест. `red_on_base` е по критерий.
- Готов оракул: `OracleManifest` (spec_hash, пътищата с sha256 на всеки файл, red_on_base) и `oracleHash`. Тестовете
  отиват в хранилището на D-362 като нова версия на `private.hidden_tests` с `spec_hash` (функция
  `private.add_oracle_tests`, само service; ред `hidden_tests` в дневника със spec_hash); `public.hidden_test_sets`
  също има `spec_hash`. Неготов оракул не пази тестове. Ред `oracle_built` в дневника: хешове, статус и броеве.
  Таблица `public.oracles` (статус building / not_ready / ready / approved / failed, причини, red_on_base, манифест,
  хеш, версия); членовете четат, пише само сървърът.
- Одобрение: `POST /api/conversations/:id/oracle/approve` с `{oracle_hash}`; само човек със сесия, CSRF и произход,
  `approve.level1` с обхвата на проекта (както D-533). Хешът трябва да е видяният и да е собственият хеш на записания
  манифест за тази спецификация (`oracle_changed` / `oracle_not_ready`). Ред `oracle_approved` с `{conversation,
  oracle, oracle_hash, spec_hash, tests, criteria, by}` — без пътища, имена и съдържание на тестове.
- „Започвай“: когато планът на одобрената спецификация има `hidden_tests`, без одобрен оракул за нейния хеш →
  `oracle_not_approved`. С одобрен оракул задачата носи `tasks.oracle_hash`; работникът го запечатва в договора
  (`Contract.oracle_hash`, незадължително, влиза в `contract_hash`, агентът не го вижда) до `spec_hash`. Скритите
  тестове на писателя са точно файловете на одобрения оракул, всеки сверен със sha256 от манифеста (различен файл →
  BLOCKED `oracle_tampered`; неодобрен хеш → BLOCKED `oracle_unapproved`); минават само по пътя на D5 (дърво B след
  входовете на D11). Задача без оракул взима последния общ набор (`spec_hash is null`), никога набор на оракул.
- Мутационна оценка (D11.oracle): същите мутанти на D-300 (променените редове на писателя) се пускат в дърво B със
  скритите тестове; мутант е хванат от оракула, ако скрит тест, минал на B, не минава на мутанта (или пускането изтече
  или отчетът е счупен). Видимите тестове тук не се броят. Дял < `ORACLE_MIN_KILL = 0,6` → UNKNOWN
  `D11:oracle_too_weak:<хванати>/<всички>`, затова присъдата не може да е VERIFIED; иначе pass с `{killed, total,
  score, threshold}` в evidence. Evidence-ът не е видим за агента (кой мутант оцелява казва какво оракулът не
  проверява). Без места за мутация или при special case / test env (вече UNKNOWN в D11) → n/a; непуснат мутант →
  UNKNOWN not_run. Свързано е докрай: daemon подава `oracleGrade` при `oracle_hash`, `runTask` → `verifyTrees`.
  `mandat verify --hidden <dir> --oracle-min-kill <0..1>` прави същото отвън.
- UI (малко, ще се прави наново): под одобрена спецификация, която иска оракул — карта „Оракул“: какво е, „Направи
  оракула“ / „Направи оракула пак“, „се прави…“, „не е готов“ с всяка причина, „готов: N файла“, червено/не червено
  на сегашния код по критерий, „Одобри оракула“ за човек, който може. Потокът (SSE) стои отворен, докато оракулът се
  прави. Нов детектор в етикетите: „Скритите тестове хващат нарочно развалена промяна“.
Избори при неясно:
- Прагът 0,6 при до 3 мутанта (MAX_MUTANTS) значи 2 от 3; 1 от 3 е слаб оракул. Грубо, но детерминистично; повече
  мутанти е отделен ход (цена: по едно пускане на тестовете на мутант).
- Критерий с доказ human не иска тест (той е непроверим за машина и в профили с тестове вече го спира
  `untestableCriteria`); ако все пак има тестове с етикета му, те се броят в red_on_base.
- Тест, пропуснат (skipped) за критерий или непроменено → `not_run`: оракулът трябва да е изпълним.
- Тестовете се пазят в базата само за готов оракул; неготов се прави наново, не се поправя на ръка.
- Агентът на оракула минава и обичайната проверка на `runTask` (дървета A/B); присъдата ѝ не се ползва — оракулът се
  съди само от червено на базата. Цена: едно пускане повече; полза: без втори път през `runTask`.
- Копието на diff-а на оракула в `runs/<id>/export/` се трие след записа; живият поток на сесията (workbench) показва
  действията на агента на оракула на човека, както при всяка задача — човекът може да вижда тестовете, писателят не.
Защо: heavy-process §3 („скрити приемни тестове… пише ги отделен агент, писателите никога не ги виждат“, „оракулът се
проверява сам с мутации“, „заключване: контролна сума; човекът одобрява, че оракулът покрива спецификацията“), М1 Х3;
D-362 (скритите тестове само в дърво B), D-300 (мутанти), D-532 (OracleManifest, oracleHash), D-533 (одобрение).
Тестове: contract oracle.test.ts (3; текстът на задачата, етикетите, тялото на одобрението, новите видове); core
oracle.test.ts (14; промяна само с тестове, таблица на червено на базата: без тест, зелен нов, един от два зелен,
червен непроменен, непроменено без тест, без етикет, непознат етикет, пропуснат, без резултати; оценката: над/под
прага, timeout и счупен отчет, непуснат, без места); verify oracle-base.test.ts (2; собствен run като дърво B, само
тестовете на оракула в резултата, огледалото непокътнато, бягство от папката), verify-cli.test.ts (+3; D11.oracle
pass с броя, слаб оракул → UNKNOWN oracle_too_weak при D11.mutation pass, флагът); worker oracle.test.ts (8; договорът
на оракула, готов: манифест, хеш, тестовете по спецификация, нищо доставено, огледалото непокътнато, diff-ът изтрит,
дневник без съдържание; зелен нов → не е готов, нищо не се пази; промяна извън тестовете; без изход → failed;
писателят: точно тестовете на оракула, оценката, oracle_hash в договора; задача без оракул — общият набор; подменен
файл → oracle_tampered; неодобрен → oracle_unapproved); web conversation.test.ts (+6, D-533 „Започвай“ вече
одобрява и оракул; „Направи оракула“, „Започвай“ спрян без одобрен оракул, одобрението с дневник само с хешове,
oracle_hash в задачата и договора, research без оракул, маршрутите с CSRF), conversation-oracle.test.ts (4; картата).
Docker тест за червено на базата не е писан и `pnpm test:docker` не е пускан (място на диска); живата проверка с
истински агент и пясъчник остава за Симо.
Статус: решено.

## D-535 Работа по единици с един писател, проверка срещу оракула и печат (М1 Х6/Х7 минимум, 17.11.2026)
Решение: „Започвай“ върху одобрена спецификация с одобрен оракул вече не прави една задача, а работа (`public.jobs`).
Работата се планира, строи се единица по единица на свой клон в огледалото, проверява се цялата срещу целия оракул и
завършва с печат; в main влиза само след печата и едно одобрение от човек (docs/prd/heavy-process.md §5–§8).
- Планер (`planJob`, apps/worker/src/online/job.ts): без пясъчник, през същите пътища на модела като разговора
  (`chatModelFor`: прокси с mdt_ токен, връзка, абонамент в контейнера на профила, демо). Бюджет 0,50 $ на работа, id
  на токена = id на работата. Отговорът е един JSON `{units:[{id,title,criteria,depends_on}]}` (`PlanProposal`, zod).
  Проверката е чиста, в core (`validatePlan`): ≥ 1 единица, уникални id, само критериите на спецификацията, всеки
  критерий в ≥ 1 единица, зависимости само към известни и по-ранни единици, без цикъл (`no_units`, `bad_schema`,
  `duplicate_unit`, `unknown_criterion`, `uncovered_criterion`, `unknown_dependency`, `forward_dependency`, `cycle`).
  Проблемите се връщат на планера до `PLAN_ROUNDS = 3` кръга; иначе работата спира с въпрос. Планът се пази в
  `public.job_units`, `plan_hash = hashJcs(units)`, ред `plan_built` с `{job, spec_hash, oracle_hash, plan_hash, units,
  rounds}` — без заглавия и текст.
- Клонът `mandat/job-<id>` започва от main на огледалото (`startJobBranch`). Всяка единица е нова задача (свеж контекст
  на агента; `tasks.job_id`, `unit_id`, `job_role = 'unit'`, `spec_hash`, `oracle_hash`) с текст `unitTaskText`:
  целта, единицата и нейните критерии първи, непроменено, извън обхвата, бележките на по-ранните единици (напредъкът,
  най-новите първи) и накратко останалите критерии; ≤ 4000 знака. Базата на единицата е върхът на клона на работата,
  не main. VERIFIED единица сама мести клона с един commit (`advanceJobBranch`: patch върху върха, на който е проверена,
  push само fast-forward, без --force); без changeset, PR и човек на единица. Единиците вървят една по една по реда на
  плана (зависимостите са само назад, значи редът е топологичен).
- Проверка на единица: дърво B получава само файловете на оракула, всеки етикет в които е критерий на завършените
  единици и на текущата, или `U-n` (`oracleFilesFor`; етикетите се четат от `it/test/describe("AC-n: …")` във файла).
  Файл с критерий на по-късна единица чака (той е червен нарочно); файл с няколко критерия се пуска чак когато
  всичките са на ред. Файловете минават през `oracleTestsFor` (sha256 срещу одобрения манифест; подменен → BLOCKED
  `oracle_tampered`). Без мутационна оценка на единица (тя е в крайната проверка). Ако не остане файл, дърво B е без
  скрити тестове и единицата се съди от видимите.
- Провал на единица: core `failingCriteria` взима от D5.hidden само id на критериите (`AC-n`), никога име на тест; те
  се пазят в `job_units.failing`. Повторните опити са тези на D-521: `selfFinishTick` пуска нов опит с бележка
  `unitRetryNote` („скритите проверки на AC-1 още падат…“), таванът е този на D-521 (2 опита сам). Задача на единица,
  която self-finish няма да поднови (`selfMoveOf` не е retry/wait: ask, UNKNOWN, таван, затворена), спира работата
  (`parked`) с въпрос в `jobs.question` и ред `parked` в дневника (единица, задача, опит, id на критерии). Нощният
  механизъм не става: `night_questions` е вързан със смяна; работата пази въпроса си сама.
- Бележка за предаване: агентът пише ЕДИН ред `HANDOFF: {"done":…,"deviations":[…],"risks":[…]}` в
  `/m/out/notes.txt` — същия файл като `MEMORY:` (D-400): извън работното дърво, затова никога в diff-а, с проверка за
  CANARY и redaction, преди да стигне диска. `parseHandoff` взима последния валиден ред (zod `Handoff`; `unit_id` идва
  от сървъра). Пази се в `job_units.handoff` с commit-а и отива в текста на следващите единици. Избрано пред
  `.harness/handoff.json`, защото не иска промяна в износа.
- Крайна проверка: когато всички единици минат, задача `job_role = 'final'` на базата на работата с цялата промяна
  (`jobChangeFiles` base..head) на мястото на агента — пътят на rebase (D-355, `applyFiles`), значи в нов контейнер и
  без агент. Дърво B получава всички файлове на оракула, плюс D11.oracle (`oracleGrade`, праг 0,6). VERIFIED → печат.
  FAILED с червени критерии → нова единица `fix-<n>` точно за тях (до `CONVERGE_ROUNDS = 2`), после пак крайна
  проверка. UNKNOWN (напр. `oracle_too_weak`) или изчерпани кръгове → въпрос. Self-finish не пипа крайната проверка.
- Печат (`sealFor`, core): `SessionSeal {spec_hash, oracle_hash, profile, verdict, result_ref = върхът на клона,
  unchecked, ledger_head}`; `unchecked` = критерии с доказ human и всяка проверка с unknown/n/a. Пази се в `jobs.seal` с
  `seal_hash = hashJcs(seal)`; ред `session_sealed` с хешовете, присъдата, result_ref и броя на непровереното.
- Доставка: `POST /api/conversations/:id/job/approve` с `{seal_hash}` — сесия на човек, CSRF и произход,
  `approve.level1` с обхвата на проекта (както D-533/D-534); само запечатана VERIFIED работа, чийто записан хеш е
  собственият хеш на печата и този, който човекът видя (`job_not_sealed`, `seal_changed`). Ред `job_approved` (хешове).
  Работникът после слива клона в main с `mergeLocal` (fast-forward, compare-and-swap) и пише `delivered`. Стълбата на
  доверие не дава само сливане: работа винаги чака човек. Проект, който не е на този компютър, още не се слива.
- Миграция 535: `jobs`, `job_units`, `tasks.job_id/unit_id/job_role`, `conversations.job_id`; RLS: членовете четат,
  пише само сървърът. Нови видове в дневника: `plan_built`, `session_sealed`, `job_approved`.
- Работникът тиктака работите на всеки 5 с във фон (`jobTicker`, никога два пъти наведнъж; `MANDAT_JOBS=0` спира).
- UI (малко, ще се прави наново): картата „Работа“ в разговора — състояние, планът (единици с критерии, състояние и
  присъда), текущата единица с линк към задачата ѝ, критериите, които още падат, въпросът, печатът (проверено /
  непроверено) и „Одобри и слей в main“ само за запечатана работа и човек, който може да одобрява. en/bg, „ти“.
Избори при неясно:
- Работа се прави само когато има одобрен оракул; без оракул (research и др.) „Започвай“ е както в D-533/D-534.
- Проектът на работата е проектът на одобрения оракул (тестовете му са проверени върху неговия код).
- Работата живее в разговора (без отделна страница); потокът (SSE) стои отворен, докато тя планира, строи, проверява
  или слива.
- Етикетите се четат от съдържанието на файла с регулярен израз; тест с динамично сглобен етикет не се вижда и файлът
  чака крайната проверка. Цена: по-късна обратна връзка; полза: писателят никога не е съден с червен по план тест.
Защо: heavy-process §5 (план), §6 (свеж контекст, бележка за предаване, таван → въпрос), §7 (проверка с чист контекст
срещу скрития оракул; пропуснатото става нови задачи), §8 (печат: какво е проверено и какво не; одобрение), М1 „Готово
когато“; D-521, D-527, D-532, D-533, D-534.
Тестове: contract job.test.ts (5; отговорът на планера, HANDOFF, текстът на единицата, бележката само с id, клонът и
видовете); core job.test.ts (12; таблица на плана с всеки проблем, етикетите и файловете на единица, failingCriteria,
непроверено, печатът); worker job.test.ts (5, PGlite и фалшив агент и модел, без Docker: отказан план се връща с
проблемите, plan_built само с хешове; без валиден план → въпрос; единиците по ред на клона, main непокътнат, дърво B на
единица 1 = AC-1 + U-1, на единица 2 = всичко, текстът на писателя без тест, бележката на u1 в текста на u2, крайната
проверка с applyFiles, целия оракул и оценката, печатът и `session_sealed`, main се мести само след одобрение; провал
→ 2 опита с AC-1 и без името на теста → въпрос; крайната проверка добавя единица само за червения AC-2); cli
job-ticker.test.ts (1); web conversation.test.ts (+2, 2 променени: „Започвай“ прави работа с двата хеша, печатът в
потока, одобрението и дневникът, маршрутът с CSRF), conversation-job.test.ts (3; картата). Docker тест не е писан и не
е пускан; живата проверка с истински модел и пясъчник остава за Симо.
Отворено: продължение на спряна работа след отговор на човека; N паралелни опита и по-силен съветник (М2); проект без
огледало на този компютър; единица с празна промяна (сега UNKNOWN → въпрос).
Статус: решено от кодера.

## D-536 Скритите тестове живеят в папка `__hidden__` на всяка дълбочина (жив тест 18.11.2026)
Решение: скрит тестов файл (на оракул и в дърво B на писателя) се познава по сегмент `__hidden__` в пътя, не по една
папка в корена. Така тестовете стоят там, където тестовият инструмент на проекта ги намира (в монорепо — в пакет).
- Правило за път (contract `isHiddenPath`, `OraclePath`): спрямо корена на хранилището, само `/`, без празен, `.` или
  `..` сегмент, без абсолютен път и буква на диск, с папка `__hidden__` и файл под нея. `tests/__hidden__/a.spec.ts` е
  просто едно такова място; `packages/engine/test/__hidden__/vec3.spec.ts` е друго. Пътищата в `OracleManifest` и в
  пазения набор на оракула вече са от корена (не от една папка); наборът на оракула има `dir: ""`.
- Агентът на оракула: `allowed_paths = ["**/__hidden__/**"]` (`ORACLE_GLOB`); `oracleChange` взима само тестови файлове
  в такава папка, всичко друго остава `non_test_change`. Текстът на задачата казва: сложи тестовете в папка `__hidden__`
  в директория, която инструментът вече намира (виж vitest.workspace / vitest.config / jest config / скриптовете за
  тестове; в монорепо обикновено в пакет), и импортирай кода с относителни пътища.
- Копието в дървото (verify `writeHiddenTests`, общо за дърво B и за червено на базата): всички пътища се проверяват
  преди да се запише нещо; на оракул (`dir ""`) пътят трябва да е `__hidden__` път; общият набор на D-362 (с `dir` от
  профила, по подразбиране `tests/__hidden__`) се слепва с папката си както досега.
- `splitHidden(report, files)`: скрити са резултатите точно на копираните файлове (пътят от корена в id на теста, D-025).
  Защо не всеки `__hidden__` в отчета: собствен тест на писателя в папка `__hidden__` не може да застане на мястото на
  скрити тестове, които инструментът не е пуснал.
- Нищо не е намерено ≠ всеки критерий не е пуснат: червено на базата с валиден отчет и нула резултати → проблем
  `not_discovered` („тестовият инструмент не намери скритите тестове; сложи ги там, където инструментът на проекта ги
  търси“), видим за човека в картата на оракула (en/bg). Изтичане остава `not_run`; счупен отчет → `E_ORACLE_REPORT`
  (оракулът е failed с този код), не `not_discovered`. В дърво B: копирани скрити файлове, валиден отчет и нула скрити
  резултати → D5 UNKNOWN `D5:not_discovered:<брой файлове>`; без отчет остава `D5:not_run:<брой>`. Никога тих pass.
- Филтърът на единица (`oracleFilesFor`) чете етикетите от съдържанието и не зависи от пътя; вложените пътища минават.
Избори при неясно:
- Стари оракули с пътища спрямо `tests/__hidden__` (преди D-536) не минават новата схема → задачата им е BLOCKED
  `oracle_unapproved`; оракулът се прави наново. Без миграция: функцията е от вчера и живият оракул не беше готов.
- Файл с няколко резултата, а друг без нито един (частично намиране), не е отделен проблем: счупен при зареждане файл
  също няма резултати, а двете не се различават надеждно от JSON отчета. Тестовете на такъв файл липсват и критерият
  му е `untagged_criterion` / D5 вижда по-малко тестове.
Защо: жив тест 18.11.2026, монорепо luxproof: `vitest.workspace.ts` е `defineWorkspace(['packages/*'])`, тестовата
команда в корена е `vitest run`; агентът на оракула писа в `tests/__hidden__/…` в корена, работното пространство никога
не ги намери, червеното на базата върна нула резултати и оракулът беше „не е готов“ с всеки критерий „не тръгна“.
Същото щеше да стане и в дърво B на писателя — скритите тестове тихо не тръгват. D-362, D-534, D-535.
Тестове: contract oracle.test.ts (+17; таблица на правилото за път: приети `packages/x/test/__hidden__/a.spec.ts`,
`tests/__hidden__/a.spec.ts`, отказани `..`, абсолютен, буква на диск, `\`, без сегмент `__hidden__`, празен сегмент;
`ORACLE_GLOB`, `hiddenRootPath`, `hiddenFileOf`, `not_discovered`, новият текст), task-spec.test.ts (манифестът иска
`__hidden__` път); core d5.test.ts (+2; `not_discovered` срещу `not_run`, вложени файлове и подобна папка на писателя не
се брои), oracle.test.ts (вложени пътища от корена, `not_discovered` при нула резултати, изтичане → `not_run`),
job.test.ts (+1; вложени файлове по етикети); verify hidden-copy.test.ts (7; вложени файлове на мястото си, общ набор
с папка, отказани пътища без запис), oracle-base.test.ts (+2; вложени пътища в чист клонинг, инструмент, който не ги
намира → нула → `not_discovered`, счупен отчет → `E_ORACLE_REPORT`), verify-cli.test.ts (+1; D5 UNKNOWN
`D5:not_discovered:1`); worker oracle.test.ts (договорът с `**/__hidden__/**`, манифестът и наборът с пътища от корена,
писателят получава `dir ""`), job.test.ts, run.test.ts (`oracle: true`); web conversation.test.ts (текстът),
conversation-oracle.test.ts (+1; причината в картата). Docker тест не е писан и не е пускан; живата проверка с luxproof
остава за Симо.
Статус: решено от кодера.

## D-537 Живият тест на М1 докрай (18.11.2026)
Решение: М1 мина на живо върху luxproof (pnpm монорепо) с абонамента на Claude: разговор → оси (feature) → спецификация
(6 критерия, 2 непроменени поведения) → одобрение → оракул (тестове в `packages/engine/test/__hidden__/`, AC-1…AC-6
червени на базата) → одобрение → план от 4 единици → всяка VERIFIED от първия опит → финална проверка (D5 8/8,
D11.oracle 3/3 мутанта хванати) → печат VERIFIED → одобрение → `main` на копието е 657032f.
Поправено по пътя (всяко с червен тест): извикване на инструмент в грешна форма се губеше тихо (3272107); причината за
спрял оракул се губеше (cbccc9b, cf5d2cf, faed4c8); задачите на добавени проекти търсеха копието в mirrors/ (322187a);
износът пускаше вложени node_modules (0e64e15); отделният рън на оракула имаше невалиден номер → E_GATE_POLICY (f55b817);
скритите тестове в монорепо не се откриваха (D-536); критериите и „не се променя“ са уточнени в инструкциите (697f2d0,
bfb6fd5); разговор, станал работа, изчезваше от екрана (5a3e05d).
Отворено: агентите-писатели съобщават „Bash was denied“, т.е. не пускат тестове в пясъчника (самопроверката им е слаба;
външната проверка хвана всичко); съобщенията на комитите са началото на заданието; вътрешните задачи (оракул, единици,
финал) пълнят списъка със задачи с цялото си задание; промяната е в копието на проекта, не в папката на човека.
Статус: решено.

## D-538 „Bash was denied“ не е причината; pnpm на проекта се опитваше да се изтегли (19.11.2026)
Решение: записите на агентите от живия тест (D-537, .mandat/runs/*/transcript.jsonl) показват, че тестовете тръгват:
`npx vitest run` минава. Отказват се само записите във файл през Bash (`cat >> f <<EOF`), защото `--permission-mode dontAsk`
пуска само предварително разрешеното, а агентът минава на Edit/Write. Това е желано: писането остава в Edit/Write.
Истинската грешка: `pnpm test` в агента гърмеше с „resolve pnpm@9.15.0 … tunnel error“. Образът държи свой pnpm 12.14.0,
а `packageManager: pnpm@9.15.0` на проекта кара pnpm да изтегли тази версия; мрежата отказва. При инсталация това вече
беше изключено (D-301, `manage-package-manager-versions=false`), в средите на агента и на тестовете не беше. Сега всички
среди на агента (Claude, Codex, Gemini, абонаменти) и фазата на тестовете носят `npm_config_manage_package_manager_versions=false`.
Настройката: https://pnpm.io/settings#managepackagemanagerversions (проверено 19.11.2026; pnpm чете npm_config_* от env, както при D-301).
Тест: sandbox.test.ts „the project's own pnpm pin“. На живо (19.11): в образа mandat-sandbox без мрежа проект с `packageManager: pnpm@9.15.0` — без настройката `pnpm test` търси мрежата и гърми, с нея тестовете тръгват. Жива задача не тръгна (E_IMAGES_MISSING), защото хешът на образите се смята от работната папка, а друга сесия пишеше в нея.
Статус: решено.

## D-539 Профилът на агентите, който чака одобрение, се вижда горе в картата на проекта (19.11.2026)
Решение: при живия тест (17.11) задачата спря с `harness_unapproved`, защото новият профил чакаше второ одобрение, а
бутонът „Approve this version“ беше под „Разширени“, на около 10 000 px надолу. Симо не го намери. Сега, когато най-новата
версия на профила е `proposed`, картата на проекта показва горе жълт ред: „Профилът, версия N, чака одобрение; задачите
спират дотогава“, с линк „Прегледай и одобри профила“ към `#profile-<repo>`. „Разширени“ се отваря само. Одобрението
остава отделно решение със свой код: правилата и профилът са различни неща (профилът носи права, MCP и скрити тестове)
и не ги сливаме в един бутон. Тест: harness-view.test.ts `pendingProfile`. На живо (19.11, mandat-demo/shop, профил v4): редът е горе в картата, линкът отваря „Разширени“ и „Approve this version“ е на същия екран.
Статус: решено.

## D-540 Четири отворени точки от живия тест на М1: проверките на писателя, имената на комитите, вътрешните задачи, папката на човека (19.11.2026)
Решение:
(1) Писателят пуска проверките на проекта. Причина (записите в .mandat/runs/*/transcript.jsonl, D-538): агентът слага
запис с heredoc (`cat >> f <<EOF`) и пускането на тестовете в ЕДНО извикване на Bash; `--permission-mode dontAsk` отказва
цялото извикване (записът не е разрешен — правилно), агентът пише „Bash was denied in this session“ в HANDOFF и чак после,
заради Stop hook-а `require-tests-ran`, пуска `npx vitest run`, което минава. Неуспехът на `pnpm test` (pnpm тегли
`packageManager` на проекта) е поправен в D-538 в средите на пясъчника; тук няма втора env поправка. Поправка тук:
- profile `checkPatterns` (packages/profile/src/checks.ts): детерминирана подразбираща се стойност само от одобрения профил —
  командите test, test_one, lint, typecheck от слой B; `{file}`/`{files}` → `*`; при pnpm още `pnpm exec <x>` за `npx <x>` и
  `pnpm --filter * <скрипт>` за `pnpm <скрипт>`. Команда с шел синтаксис (`&& ; | $ > ( )` и др.) никога не става правило.
  `bashRules` дава `Bash(c *)` и `Bash(c)`. Не е тихо разширение: всяко правило идва от команда, която човекът одобри в
  профила; всичко друго в шела остава отказано (dontAsk), deny правилата на слой C остават. За luxproof новото е
  `pnpm --filter * test`, `pnpm exec vitest run *`, `pnpm --filter * typecheck`; за демото — `npx eslint *` (lint с
  `{files}` досега не беше разрешен). [НП] `*` в средата на правило на Claude Code (`pnpm --filter * test`):
  https://code.claude.com/docs/en/settings (permission rules, 19.11.2026); спайк — следващият жив рън.
- Инструкциите (`instructions.md`): файловете се пишат с инструментите за редакция, никога с пренасочване/heredoc в шела;
  отказано шел извикване не значи, че проверките са отказани. `HANDOFF_HINT`: първо тестовете, HANDOFF е последната стъпка.
(2) Комитът на единица е `<тип>: <заглавие на единицата>` (gate-github `commitMessage`/`prTitle` с `title`; daemon чете
`job_units.title`). Темата е един ред ≤ 72 знака: без водеща разметка (`#`, `>`, `-`, `*`), първото изречение на дълъг ред,
рязане на дума с „…“; празна → `update`. Обикновените задачи пазят първия си ред (тестът „fix: Fix the VAT rounding“ е
същият). Крайната проверка и оракулът нямат комит.
(3) Вътрешните задачи в списъците (TaskList в работното място, дъската, прегледа, task-row) имат кратко заглавие от данните:
„Оракул · <цел>“, „Единица u2 · <заглавие>“, „Финална проверка · <цел>“ (en/bg; чиста функция `taskTitle`,
apps/web/src/lib/task-title.ts, ≤ 100 знака). Редът на `board()` (и `GET /api/board`) носи `internal_role`, `unit_id`,
`unit_title`, `spec_goal` (под RLS: членовете четат job_units, jobs, oracles, conversations). Обикновените задачи са както бяха.
(4) „Внеси в моята папка“ на доставена работа. Мястото на папката: `mandat.source` в огледалото (D-388, add-project.ts).
Само с клик на човек: `POST /api/conversations/:id/job/bring` (сесия, CSRF, произход, `approve.level1` за проекта; само
работа `delivered` с `merged_sha` на локален проект) → контролният endpoint на `pnpm local` `POST /projects/bring`
(`BringBody`: огледало, комит, клон по избор; zod на двете страни) → `bringToFolder` (apps/worker/src/online/bring-to-folder.ts).
Всичко се проверява в огледалото, преди папката да се пипне: огледалото е `MANDAT_HOME/projects/<име>.git`, комитът е в
неговия main, папката е горната на git хранилище, на клона (по подразбиране main; detached HEAD е друг клон), чиста
(`git status --porcelain` празен: нищо staged, променено или неследено и неигнорирано), а HEAD ѝ е предшественик на main на
огледалото (непознат комит = собствена работа = разклонено). Тогава `fetch` + `merge --ff-only`. Иначе нищо не се прави и
отговорът казва защо (`no_source`, `not_a_repo`, `not_delivered`, `other_branch`, `dirty`, `diverged`, `refused`) с команда,
която човекът може да пусне сам. Никога force, stash, reset или checkout. Ред в дневника `folder_updated` само при истинско
преместване: `{conversation, job, from, to, folder: sha256 на пътя, by}` — без път. Git тече с чиста среда (cleanGit:
без глобален и системен config, без hooks) — затова файл, игнориран само в глобалния gitignore на човека, се брои за промяна
(отказ, не загуба).
Промяна на D-388: „папката само се чете“ става „папката само се чете; пише се в нея само с клика на човек ‚Внеси в моята
папка‘, само fast-forward на чиста папка“.
Избори при неясно: при „вече е там“ отговорът е успех без ред в дневника; клон, различен от main, се избира само с тялото
`{branch}` (UI-то засега праща main); несвързан контролен endpoint → 503 `control_unavailable`.
Номер: тези комити първо писаха D-538 (номерът беше зает междувременно от друга сесия); от d2ca9c9 нататък текстът е D-540.
Тестове: profile checks.test.ts (6; формите на pnpm, шел синтаксис → нищо, npm без pnpm форми, разрешени са само правила от
проверките, deny остава, компилаторът не добавя pnpm env, текстът на инструкциите); contract job.test.ts (тестовете преди
HANDOFF), local-control.test.ts (+2; BringBody/BringReply); gate-github templates.test.ts (+3); worker job.test.ts (комитът на
u1 е „fix: the 10% rule“), bring-to-folder.test.ts (7, временни git хранилища без Docker: чист ff, вече там, променен /
неследен / staged → отказ без промяна, друг клон, разклонено, комит извън main, огледало извън projects / без source,
папка без .git); cli local-control.test.ts (+1; маршрутът); web task-title.test.ts (3), task-title-rows.test.ts (1, PGlite под
RLS), job-bring.test.ts (4; огледалото и комитът към контрола, дневникът без път, отказът се предава, права, само доставена,
лошо тяло, без контрол, маршрутът с CSRF и произход), conversation-job.test.ts (+2; бутонът и резултатът).
Образите: промените в packages/contract влизат в хеша на образите на пясъчника, филтъра и проксито (workspace deps на
mcp-bridge, egress-gate, llm-proxy) → `pnpm mandat images build`.
Не е проверено на живо: правилата на Claude Code за `pnpm --filter * …` в пясъчника; бутонът срещу истинската папка на luxproof.
Статус: решено от кодера.

## D-541 М2 Х5/Х6: екип само където работата се дели — вълни и паралелни единици в свои копия (19.11.2026)
Решение: начинът на работа идва от осите, които човекът одобри в разговора: `divisible: yes` → `waves`, всичко друго
(no, unknown, без оси) → `single` като в М1 (чиста `jobMode`, packages/core/src/job.ts). Причина: Fable 5.2 system card
§8.12 (екип от 5 = същият резултат като един агент) и Kim et al., arXiv 2512.08296 (от +81% до −70% според задачата) —
екипът помага само на работа, която се дели; docs/prd/heavy-process.md §4–§6.
- Планерът във `waves` получава `PLANNER_SYSTEM_WAVES` (`plannerSystem(mode)`): единици без зависимост се строят
  едновременно от различни писатели в отделни копия; зависимост се пише само когато единицата наистина иска кода на друга.
  Проверката на плана (`validatePlan`) е същата. `plan_built` носи още `mode` и броя `waves` (`unitWaves`).
- `unitsToStart`: в `single` — първата непреминала единица, само без задача (М1 без промяна); във `waves` — всяка чакаща
  единица без задача, чиито зависимости са минали, по реда на плана, до `JOB_PARALLEL_MAX` = 3 едновременно (WIP лимитът на
  профила за хранилището също важи при claim). Всяка единица е нова задача = нов контекст и свой пясъчник, с база главата
  на клона в момента на пускане.
- Кацане: единица, проверена на по-стара глава, отива на новата с `git apply --3way` (само във `waves`; в `single`
  преместена глава остава отказ). Същата промяна, вече там → минава без втори комит. Конфликт → задачата е BLOCKED
  `job_branch_does_not_apply`, работата я пуска отново като нова задача на новата глава (`relands`, до `RELAND_MAX` = 2;
  ред `unit_relanded` {job, unit, why, relands}); след тавана — паркиране с въпрос, както в М1.
- Защо 3-way без нова проверка на единицата: финалната проверка вижда целия клон срещу целия оракул и D11.oracle, а
  червените критерии стават нови единици (М1); нищо не отива в main без печат и одобрение.
Миграция 20261119000541_job_waves.sql: `jobs.mode` ('single' | 'waves'), `job_units.relands`.
Тестове: core job.test.ts (+4: оси → режим, вълни, single, waves със слотове), contract job.test.ts (+1: инструкцията и
лимитите), worker job.test.ts (+4: неделима работа → един писател и М1 планер; две единици едновременно на една база,
по-късната каца на преместения клон; една и съща промяна → един комит; конфликт → нова задача на новата глава с ред в
дневника).
Не е проверено на живо: два пясъчника едновременно за една работа на luxproof.
Статус: решено от кодера.

## D-542 М2 Х6: спряла единица получава съвет и два свежи опита; въпросът не спира останалата работа (19.11.2026)
Решение (docs/prd/heavy-process.md §6: „след 2 неуспеха нов контекст; по-силен модел като съветник; N паралелни опита,
печели този, който минава повече тестове; таван → въпрос в опашката, останалата работа продължава“):
- Единица, чиито задачи спряха след обичайните опити (само-довършване, D-521) с FAILED, се спасява веднъж (`RESCUE_MAX` = 1).
  Съветник (моделът на работата, бюджет $0.3, без пясъчник) чете целта, единицата, критериите ѝ, id на падналите
  критерии, кодовете на причините и бележката на писателя — никога скрит тест (`ADVISOR_SYSTEM`, `advisorUser`). После
  `RESCUE_TRIES` = 2 нови задачи (свеж контекст, по един опит: `attempts_max` = 1, само-довършването не ги умножава)
  строят единицата едновременно, със съвета като съвет (`rescueTaskText`); вторият опит е помолен за друг подход.
  Ред `unit_rescued` {job, unit, tries, rescues, failing} — без текста на съвета.
- Изборът по оракула: първият VERIFIED каца; опит, завършил след като единицата е минала, не каца (`CLOSED`
  `another_try_won`). Ако никой не мине, единицата пази най-малкия списък с падащи критерии.
- Ако и спасяването не мине (или няма модел за съвет, или преместването е изчерпано): единицата е `parked` със свой
  въпрос (`job_units.question`, ред `parked` {job, unit, …}). Работата продължава с всичко, което не зависи от нея
  (вълни); паркира се цялата чак когато нищо не работи и нищо не може да тръгне — въпросът ѝ събира въпросите на
  чакащите единици. В `single` това е веднага (следващите единици чакат по ред), както в М1, но след спасяването.
- „По-силен модел“: засега съветникът е моделът на работата; изборът на модел по роля идва с Х4 (`selectChannelForRole`).
Код: apps/worker/src/online/job-unit.ts (ново: уреждане на единица, преместване, спасяване, паркиране на единица),
job.ts, job-task.ts; web: състояние „чака теб“ на единица в картата на работата.
Миграция 20261119000542_job_rescue.sql: `job_units.rescues`, `tries`, `question`, състояние `parked`.
Тестове: contract job.test.ts (+2), worker job.test.ts (+2 и разширен тест за тавана: съвет без скрит тест, два опита с
по един опит, без само-повторение, паркиране; спасен опит каца, вторият минал не каца; паркирана единица във вълни не спира
независимата работа), web conversation-job.test.ts (+1).
Не е проверено на живо.
Статус: решено от кодера.

## D-543 М2 Х4: работен харнес на работата — карта и списък с функции извън дървото; модел по роля (19.11.2026)
Решение (docs/prd/heavy-process.md §4; идеите: кратка карта + docs като източник на истина, списък с функции и файл с
напредъка, свеж контекст, който знае „къде съм“):
- Всяка единица получава в `/m/in/job` (`JOB_IN`; root го пише преди агента, режим 0444, папките 0555 — същият seed като
  /m/in/harness, `seedFiles`) `README.md` — карта до ~100 реда: целта, „ти строиш u2“, начин (един писател / екип),
  „започни тук“ (git log, първо тестовете на проекта, счупеното първо, само твоята единица), планът със състояния и
  зависимости, непроменимото, извън обхвата, дневник на решенията (бележките за предаване на минали единици) — и
  `features.json` с всички критерии, техните единици и `passes`. Чиста функция `jobMapFiles` (packages/contract/src/job-map.ts).
- Разлика от списъка, който агентът сам отбелязва: тук `passes` слага само Mandat — от единиците, минали скрития оракул.
  Писателят не може да отбележи своята работа като готова, затова няма какво D2 да пази в този файл (той е извън
  дървото и само за четене). Никога скрит тест, име или съдържание.
- Текстът на единицата сочи картата (един ред). Крайната проверка няма писател и няма карта.
- `init.sh`: стъпката „инсталация“ на пясъчника вече е тя (по профила); тестовият runner с кратък изход е D1/D5 на
  проверката. Не дублираме.
- Модел по роля: `jobs.roles` (`JobRoles`: planner / advisor / writer → {agent, model}); роля без избор ползва агента и
  модела на работата (`roleRoute`). Планерът и съветникът минават през `modelFor` с тях; задачите на единиците се
  създават с агента и модела на писателя. Изборът от UI идва с новото UI; засега само по API/база.
Миграция 20261119000543_job_roles.sql: `jobs.roles`.
Тестове: contract job-map.test.ts (5: картата, списъкът, граници, ролите, строга схема), job.test.ts (+1: указателят);
worker job.test.ts (+1: картата и списъкът на всяка единица, passes след минала единица, ролите на планера и писателя,
без карта за крайната проверка).
Не е проверено на живо (и Docker тестът на seed-а не е пускан отново: образите трябва да се строят наново след комита).
Статус: решено от кодера.

## D-544 М2 Х7: монитор за мамене (D13.cheat) и втори филтър на ревюто (19.11.2026)
Решение (docs/prd/heavy-process.md §7: „ревю агенти с втори филтър срещу фалшиви тревоги“, „монитор за мамене: пипнати
или отслабени тестове“; ImpossibleBench: мамене при видими тестове, скрити тестове го свалят):
- D13.cheat (чист детектор, packages/core/src/d13.ts): знаци, че писателят е играл на проверките вместо да построи
  нещото — код извън тестовите файлове, който се държи различно само под тестовете (`process.env.VITEST`,
  `JEST_WORKER_ID`, `import.meta.vitest`, `NODE_ENV === "test"`; `NODE_ENV === "production"` не е знак); промяна на
  настройките на тестовия runner (vitest/jest/playwright/karma/mocha/cypress config) или на скрипта `test` в package.json;
  търсене на скритите проверки във входовете на инструментите от транскрипта (`__hidden__`, `hidden_tests`, „hidden
  checks“, `/m/verify`). Изтрити, отслабени, пропуснати и фокусирани тестове вече хваща D2.
- Знак → `unknown` с файл:ред (човек поглежда), никога `fail`: законна промяна може да изглежда същата. В работа това
  спира единицата като UNKNOWN и тя чака човек със свой въпрос (D-542; спасяване има само при FAILED).
- Обхват: само рънове, съдени от скрити тестове (там играта на съдника има смисъл; D2 пази видимите тестове навсякъде),
  без задачата-оракул (тя сама пише скритите тестове). apps/worker/src/cheat.ts чете transcript.jsonl (≤ 50 MB).
- Ревюто (packages/review, съветник по профил G.review): всяка висока находка се проверява отново с отделно извикване,
  което вижда само нея и частта от промяната за този файл (`CONFIRM_SYSTEM`). Непотвърдена → `low` (остава в списъка с
  бележка); неясен или недостъпен проверител → остава `high` (без тихо минаване).
- Не е направено тук: диференциален оракул и e2e сценарии с твърдения — с режима миграция (следваща стъпка) и после;
  истинското извикване на модела за ревюто в production (`reviewCall` е само шев за тестове) — с модела по роля (D-543).
Тестове: core d13.test.ts (6), worker cheat.test.ts (3), review review.test.ts (+2), run.test.ts (броят извиквания на
съветника е 2: ревю + втори филтър).
Статус: решено от кодера.

## D-545 М2 Х5: пилот на голяма работа → настройка → пълно минаване (19.11.2026)
Решение (docs/prd/heavy-process.md §5: „винаги пилот на 3–10 единици → настройка → пълно минаване“; Airbnb: 75% за
4 часа, 97% за 4 дни след настройка на пилот):
- Пилот има, когато профилът от осите го иска (`plan.pilot`: размер l или xl, D-532) и планът има повече от
  `PILOT_MIN` = 3 единици. Размер: 10% от единиците, от 3 до `PILOT_MAX` = 10 (`pilotSize`). Единиците: първите по реда
  на плана, чиито зависимости също са в пилота (`pilotUnits`; при валиден план това е префикс). `job_units.pilot`.
- Докато пилотът тече (`jobs.pilot_state = 'running'`), тръгват само негови единици (`unitsToStart(…, {pilotOnly})`), и в
  двата начина. Паркирана пилотна единица → нищо друго не може да тръгне → работата паркира с въпроса ѝ (D-542): провален
  пилот спира, преди да се похарчи за всичко.
- Минал пилот → настройка (`tunePilot`): моделът на планера (роля planner, D-543; бюджет $0.3) пише кратко ръководство
  от бележките за предаване и броя спасени/преместени пилотни единици (`PLAYBOOK_SYSTEM`, `playbookUser`) — никога скрит
  тест. Без модел или отговор ръководството са отклоненията и рисковете от бележките. `jobs.playbook`, `pilot_state =
  'tuned'`, ред `pilot_done` {job, units, rescues, relands, by: model|notes} — без текста.
- Всяка непилотна единица (и нейните опити при спасяване) получава ръководството в текста си като уроци, не заповеди
  (`withPlaybook`); пилотните — не.
Миграция 20261119000545_job_pilot.sql: `job_units.pilot`, `jobs.pilot_state`, `jobs.playbook`.
Тестове: core job.test.ts (+3: размер, избор, само пилотът тръгва), contract job.test.ts (+1), worker job.test.ts (+2:
пилот от 3 при 5 единици и размер l, нищо извън пилота не тръгва преди края му, настройката и ръководството в по-късните
единици, не в пилотните; без пилот при размер m). `plan_built` носи `pilot` (брой).
Не е проверено на живо.
Статус: решено от кодера.

## D-546 М2 Х5: режим миграция — местата се намират детерминистично и всеки файл има категория (19.11.2026)
Решение (docs/prd/heavy-process.md §5: „местата се намират детерминистично с излишък и се категоризират (готово, без
значение, за агент, за човек); всеки файл е автомат със статус“; Google и Airbnb намират местата с инструменти, не с модел):
- Миграция е работа, чиято одобрена спецификация е с профил `migration` или чиито оси дават `migration` (еталон
  old_system / reference_impl, D-532). Планерът получава още `PLANNER_MIGRATION`: да даде `sites.match` (разширен regex),
  `files` на всяка единица и `skip` [{file, why: done | irrelevant | human}] за намерените файлове, които никоя единица не
  взима.
- Сървърът сам търси местата: `git grep -l -I -E -e <match> refs/heads/main --` в огледалото (`findSites`; чиста среда на
  git, без шел; до `SITES_MAX` = 2000). Всеки намерен файл трябва да е в точно една единица или в skip (`validateSites`):
  иначе планът се връща на планера с `uncovered_site: <файл>` / `site_twice` (до 50 проблема на кръг); без `sites` →
  `missing_sites`; regex, който git отказва → `bad_sites`; повече от 2000 → `too_many_sites`. Модел предлага регекса, но
  не той решава кои места има.
- Таблицата на местата (`siteTable`: файл, категория unit / new / done / irrelevant / human, единица) е в `jobs.sites`;
  състоянието на файла е състоянието на неговата единица. Файловете на единицата са в текста ѝ (`withFiles`) и в
  `job_units.files`. Местата „за човек“ влизат в печата като непроверени („<файл>: a migration site for a person“).
  `plan_built` носи броя на местата.
- Пилотът на миграцията е този от D-545 (по размера). Диференциалният оракул (стара срещу нова система на същите входове)
  не е направен тук: оракулът на миграцията засега са скритите тестове и мутациите; диференциалът е следваща стъпка.
Миграция 20261119000546_job_sites.sql: `jobs.sites`, `job_units.files`.
Тестове: core job.test.ts (+3: проверка, таблица, печат), contract job.test.ts (+2), worker job.test.ts (+2: пропуснат
файл се връща на планера, таблицата се пази, файловете в текста; без sites и с лош regex — обратно на планера).
Не е проверено на живо.
Статус: решено от кодера.

## D-547 Зелен клон при доставка: работата се строи наново върху новия main (М3 Х8, 19.11.2026)
Решение: проверката и печатът са върху определен main. Ако main се е преместил между печата и сливането (сливането не
е fast-forward), Мандат не слива стария резултат:
- взима цялата промяна на работата (base..head), прилага я с 3-way върху новия main в един комит и мести клона
  `mandat/job-<id>` само от стария му връх (update-ref със старата стойност);
- старият печат и одобрението му отпадат; работата минава нова крайна проверка срещу целия оракул върху новия main
  и получава нов печат, който чака ново одобрение;
- в печата има `base_ref`: върху кой main е проверен резултатът;
- в дневника: `job_restacked` (от коя основа, към коя, новият връх, номер, хешът на стария печат);
- ако промяната не се прилага (конфликт) или main се мести повече от 3 пъти (`RESTACK_MAX`), работата спира с въпрос.
Защо: heavy-process.md §8 „зелен клон с пълна регресия“. Регресията вече е в крайната проверка (D1 по базовите тестове),
но само ако проверката е върху main, в който ще влезе. Одобрението не се пренася: кодът, в който влиза, е друг.
Тестове: worker job.test.ts (2: преместен main → ново строене, нова проверка, нов печат, ново одобрение; конфликт →
въпрос). Не е проверено на живо. Статус: решено от кодера.

## D-548 Бюджет за бързина: тестовете не стават много по-бавни (М3 Х8, 19.11.2026)
Решение: нов детектор D14.perf в проверката, след D1. Отчетът на vitest вече пази времето на всеки тест (`durations`).
D14 сравнява само тестовете, които са минали и на базата, и в дърво A (базовите тестове върху резултата):
- тест е над бюджета, ако е над 3 пъти по-бавен И с повече от 500 мс;
- целият набор (същите тестове, събрани) е над бюджета, ако е 1,5 пъти по-бавен И с повече от 5 с;
- над бюджета → `unknown` с подпис `D14:slower:<тест>` и списък с до 10 най-забавени: присъдата е UNKNOWN и човек гледа;
- без времена (друг runner, невалиден отчет) → n/a; в печата това е „D14.perf: not run“.
Защо: heavy-process.md §8 „бюджети за производителност“. Времето е шумно (друго натоварване, базата от кеша), затова
праговете са широки и превишението е въпрос, не отказ. Числата не идват от спецификацията засега; критерий с proof
„numbers“ остава за човека или за отделна проверка.
Тестове: core d14.test.ts (5). Етикети в web (D13 и D14). Не е проверено на живо в Docker. Статус: решено от кодера.

## D-549 Заобикалянето на проверките също става правило (М3 Х9, 19.11.2026)
Решение: към четирите фиксирани стеснявания на D-530 се добавят още:
- код, който се държи различно под тестовете (`D11:test_env`, `D13:test_env_branch`) → границата `no_test_env` в слой B;
- търсене на скритите тестове или проверки (`D13:hidden_probe`) → границата `no_hidden_probe` в слой B;
- променен конфиг на тестовия runner (`D13:test_config_change:<файл>`) → забрана за писане в този файл (`protect_path`,
  слой C). Ред с test скрипт в package.json не дава правило: D3 вече пази `package.json#scripts`.
Текстовете на границите са константи в кода (`NO_TEST_ENV`, `NO_HIDDEN_PROBE`), никога текст от модел. Иначе всичко е
като в D-530: ≥ 3 задачи от един вид за 30 дни, bench врата, стесняването се приема само, прогноза и откат.
Защо: heavy-process.md §9 „всеки провал → правило“. М2 добави монитора за мамене (D-544); без това правило той само
питаше човек всеки път.
Тестове: profile evolve.test.ts (+2). Етикети в web. Статус: решено от кодера.

## D-550 Скрит тежък бенчмарк като втора врата за правилата (М3 Х9, 19.11.2026)
Решение: в bench има отделен набор `HELDOUT` (H1–H8), който не е част от видимия bench (`mandat bench` не го пуска) и
от който никога не се правят правила — правилата идват само от присъдите на истински задачи (D-530):
- тежък означава всички проверки наведнъж: скритите тестове заедно с lint и typecheck на проекта, и при двата договора
  (bugfix и free), така че една промяна на профила трябва да издържи там, където детекторите се срещат;
- вратата на опита (evolve) пуска и видимия, и скрития набор с текущия и с променения профил. По-лош скрит резултат →
  отказ, дори когато видимият е същият;
- от скрития набор излизат само броевете (pass, total, false_verified) в `profile_trials.bench.*.heldout`, без кои
  сценарии са паднали;
- работникът изисква скрития набор (`requireHeldout`): ако той не е пуснат, промяната не се приема сама, а чака човек.
Защо: heavy-process.md §9 „скрит защитен бенчмарк“. Видимият bench е и списък с примери; правило, което минава само него,
може да е напаснато. Скритият набор е честна проверка само ако никоя част от системата не се учи от него.
Граница: тежките многостъпкови сценарии на цели работи (няколко единици) остават за М4 (Х10); тук са комбинации от
известните фалшиви агенти. Не е пускан на живо в Docker (очакваните причини са извлечени от B-сценариите със същите
фалшиви агенти). Тестове: bench run-bench-trial.test.ts (+2), scenarios.test.ts (+1), worker evolve.test.ts (+2).
Статус: решено от кодера.

## D-551 Архив с родословие на профила (М3 Х9, 19.11.2026)
Решение: всяка версия на профила, която Мандат прави, пази родителя си (`parent_id`), как е дошла (`origin`: person,
evolve, evolve_rollback, ablation) и опита зад нея (`trial_id`). Старите версии остават (superseded), затова веригата
от първата до текущата версия винаги може да се прочете обратно:
- `lineage()` в packages/profile (чиста) върви от версия към родителите ѝ и за всяка стъпка дава промяната, класа
  провал, броя задачи като доказателство, bench преди и след и броевете на скрития набор (D-550);
- `profileLineage(db, repo)` в работника чете редовете; цикъл или липсващ родител спира веригата, до 200 стъпки;
- версиите, които прави човек, засега нямат origin (null); веригата ги показва като начало.
Защо: heavy-process.md §9 „архив с родословие“: всяка промяна на харнеса да може да се проследи до доказателствата си
и да се върне.
Тестове: profile lineage.test.ts (2), worker evolve.test.ts (+1). UI няма (UI-то се прави наново). Статус: решено от
кодера.

## D-552 Профилът от „Други“ се пази с име след успех (М3 Х9, 19.11.2026)
Решение: когато работа с профил „Други“ (conversation.profile = other) стигне до доставка (сляна в main), Мандат пази
профила в `saved_profiles`: името е целта на спецификацията на един ред (до 80 знака), плюс осите и планът от
`deriveProfile` (оракул, единица, вълни, пилот):
- ключът е `axesKey(axes)`: всички оси без размера (той решава само пилота), еталонът по вид, доказите сортирани; докато
  ос, която има значение, е unknown, ключ няма;
- по един запазен профил на организация и ключ; първият остава; в дневника `profile_saved` (работа, име, ключ);
- в разговора, когато сървърът изведе „Други“ за нови оси, той търси запазен профил със същия ключ и казва на модела:
  „A saved profile fits: "<име>"“, за да планира по същия начин, освен ако човекът не каже друго. Профил с име
  (функция, миграция…) никога не търси.
Защо: heavy-process.md §0: „Други“ — харнесът сам планира профила от осите; след успех профилът се пази с име.
Граница: запазва се името и планът; ролите на моделите и ръководството от пилота още не се пренасят.
Тестове: core saved-profile.test.ts (3), worker conversation.test.ts (+1), job.test.ts (+1). Статус: решено от кодера.

## D-553 При нов модел частите се пробват без тях, по една (М3 Х9, 19.11.2026)
Решение: част, която Мандат сам е добавил (приет опит от D-530/D-549), може да е излишна за следващия модел. Затова на
тика на evolve, когато в него нищо не е прието и нищо не е върнато:
- моделът на частта е най-честият `<агент>:<модел>` сред задачите, които са я доказали; моделът сега е този на
  последната задача, завършила след приемането; ако са различни и частта още е в профила, тя е кандидат;
- bench (видимият и скритият, D-550) с текущия профил и без частта (`removeChange`, точната обратна на `applyChange`);
- без частта е по-зле (или скритият набор не е пуснат) → `refused`: частта остава;
- без частта е не по-зле → `benched`: махането разхлабва (`isNarrowing` е false), затова чака човек; профилът не се
  променя тук. В дневника `profile_trial` с `action: ablation`, моделът тогава и сега;
- по веднъж за част и модел (`ablate|<правило>|<детайл>|<модел>`), по една на тик.
Защо: heavy-process.md §9 „при нов модел части се махат една по една и се мери“; „нови права — само с човек“: махането на
правило е разширяване, затова решава човек.
Граница: одобрението на махането в UI още го няма (версията тогава ще е с `origin: ablation`, D-551).
Тестове: profile evolve.test.ts (+2), worker evolve.test.ts (+1). Статус: решено от кодера.

## D-554 Списъкът със задачи: вътрешните задачи на една работа са един ред (19.11.2026)
Снимките от 19.11 показаха, че оракулът, единиците u1…u4 и финалната проверка на една работа заемат по ред в лявата
колона и избутват истинските задачи. D-540 им даде кратки заглавия, но редовете останаха.
Сега:
- `foldJobs` (apps/web/src/lib/task-list.ts, чиста функция) сгъва вътрешните задачи на една работа в един ред;
- редът стои на мястото на най-новата от тях, носи целта на спецификацията и състоянието на най-новата;
- отваря разговора (`/?chat=…`), където са единиците, печатът и „Bring into my folder“; там е и маркиран като избран;
- заявката на задачите дава `conversation_id` (през jobs или oracles);
- вътрешна задача без разговор остава отделен ред.
Защо: за човека работата е едно нещо; подробностите по единици са в разговора. Отделна задача (без работа) не се променя.
Тестове: web task-list.test.ts (4). Статус: решено от кодера.

## D-555 Скритият набор на живо в Docker (М3, 20.11.2026)
Решение: H1–H8 (D-550) минаха в Docker с новите образи. Резултатът е 7/8 и нула фалшиви VERIFIED, за около 5 минути.
H3 (`b36-test-env`) излезе FAILED вместо очакваното UNKNOWN, и причината е истинска:
- в демо магазина няма типове за `process.env`, затова typecheck пада (`D8:type_fail:-`);
- D11 вижда клона „само под тестовете“ (`D11:test_env:src/cart.ts:10`);
- мониторът за мамене го вижда също (`D13:test_env_branch:src/cart.ts:10`), което е първата му жива проверка.
Очакването на H3 е поправено на FAILED с трите причини. Сега наборът е 8/8 по очакванията.
Тестове: bench scenarios.test.ts, run-bench-trial.test.ts. Статус: решено от кодера.

## D-557 Интервю за целия проект при добавяне (демо 4.12, 20.11.2026)
Решение: веднага след добавяне на проект има бутон „Опознай проекта“. Той отваря разговор с `purpose: project` на
първия агент, който може да работи, и води в него. Това не е задача: няма оси и спецификация.
- Моделът има свои инструкции (`PROJECT_SYSTEM`): първо чете проекта (README, пакетите, тестовете) и пита само каквото
  кодът не казва. После предлага описание на проекта с `propose_project`: продукт, потребители, какво работи днес,
  какво не бива да се чупи, командите (install, build, test, dev), технологии, кой одобрява, таван на разход на задача.
- Сървърът проверява описанието със zod (`ProjectBrief`). Готово е само когато има потребители, какво работи днес и
  команда за тестовете (`projectBriefMissing`). Иначе моделът получава какво липсва и продължава. Готово описание
  приключва отговора.
- Само човек с approve.level1 за проекта го одобрява, по хеша, който е видял (`/api/conversations/:id/approve-project`).
  Проектът (repos.brief, brief_hash) пази одобреното. В дневника `project_approved` е само с хеша, без текста.
- Всеки следващ разговор за задача на този проект получава одобреното описание като данни в `<project>`, затова пита
  по-малко.
Защо: демото на 4.12 (docs/prd/demo-2026-12-04.md §3): интервю в началото на всеки проект; heavy-process.md §1.
Граница: планерът на работата още не чете описанието; командите от него още не влизат в профила на харнеса.
Тестове: contract project-brief.test.ts (3), worker conversation.test.ts (+4), web project-interview.test.ts (2).
Не е проверено на живо. Статус: решено от кодера.

## D-556 Jarvis: глас, който слуша, говори на български и действа през харнеса (демо 4.12, 20.11.2026)
Симо (20.11): за демото на 4.12 харнесът има глас, който се представя, води по екраните и агентите и „изпълнява“; гласът е
функция на продукта, не само на демото. Българският език, „да говори много добре“, слуша и действа; ElevenLabs по избор.
Сега:
- договорът (packages/contract/src/voice.ts) има един списък с 9 инструмента за всеки двигател: open_screen, whats_waiting,
  list_projects, task_status, start_conversation, send_message, start_work, steer_agent, describe_screen; zod за
  аргументите им; личността на Jarvis на български. Няма инструмент за одобрение, сливане или подпис (тест го пази);
- ключът на ElevenLabs върви като ключа на Exa: запечатан (voice:elevenlabs) → проксито при старт (boot „voice“) → само в
  паметта на проксито (AGENTS.md правило 2). Браузърът никога не го вижда;
- проксито прави агента на човека: създава 9-те client tools и агента (език bg, глас Eleven v4 turbo, слушане Scribe,
  частен агент), пази id-то му до usage log-а (не е тайна), при смяна на настройките го обновява на място, при изтрит агент
  го прави наново. За сесия дава signed URL (wss, само хост *.elevenlabs.io), валиден 15 минути;
- `mandat local` → локалният контрол: /keys/voice, /voice/agent, /voice/session; уебът: /api/keys/voice и /api/voice/agent
  (собственик), /api/voice/session (всеки член) — пътят добавя агента и модела по подразбиране за нови разговори;
- бутонът „Jarvis“ е в root layout-а (разговорът оцелява при смяна на екраните) само при `mandat local`; инструментите се
  изпълняват в браузъра през същото API като екраните (същите права и CSRF); отговорът към модела е в <данни>;
- Настройки → Глас: ключ и „Създай Jarvis“ с ID на глас от библиотеката на ElevenLabs.
Защо: гласът е още един вход в харнеса, не нови правомощия; ключът остава като другите ключове; всеки човек си вкарва свой
ключ, а харнесът сам прави агента му — никой не настройва нищо в ElevenLabs на ръка.
Факти (elevenlabs.io/docs/eleven-agents, прочетено 20.11.2026): POST /v1/convai/tools; POST /v1/convai/agents/create;
GET|PATCH /v1/convai/agents/{id}; GET /v1/convai/conversation/get-signed-url (15 мин); заглавка xi-api-key; client tool =
{type:"client", name, description, expects_response, parameters (JSON schema)}, закачен с prompt.tool_ids; tts.model_id
eleven_v4_turbo (bg в езиците на v4); asr.provider scribe_realtime (Scribe има български); @elevenlabs/client 1.36.1 (MIT).
[НП] до живия рън с ключа: дали agent.language приема „bg“ (страницата на агентите казва „31 езика“, без списък), качеството
на гласа и разпознаването на български, LLM-ът по подразбиране claude-haiku-5-5 (идентификаторът е в enum-а на документа).
Резерви, ако „bg“ не мине: OpenAI Realtime или езикът „всички“ + български промпт.
Тестове: contract voice.test.ts (5), llm-proxy voice-upstream.test.ts (6) и proxy-voice.test.ts (5), cli local-control (1),
web voice-api.test.ts (3) и voice-tools.test.ts (7). Не е проверено на живо. Статус: решено от кодера по одобрен от Симо дизайн.

## D-558 Стратегията, ролите, копията и вратите на работата на екрана (демо 4.12, 20.11.2026)
Решение: картата на работата в разговора вече показва как харнесът е планирал работата и кой какво прави:
- профилът; един писател или паралелни писатели и колко вълни; пилотът (колко единици, чака или е минал); моделът по
  роля (планер, писател, съветник, през `roleRoute`);
- „Защо така“: фиксирани изречения, избрани от осите и плана (`strategyReasons`), никога текст от модел. Примери: дели
  се → вълни; голяма → пилот; има код → тестовете му трябва да минават; скрити тестове; свеж контекст и чисто копие;
- за всяка единица: вълната ѝ, дали е в пилота и своето копие (задачата, опитът и състоянието ѝ на живо);
- вратите на крайната проверка (D1, D2, D3, D4, D5, D8, D11, D11.oracle, D13, D14) със статус от присъдата на
  крайната проверка: мина, падна, човек гледа, не се прилага или още не е пускана. Това е отговорът на „как знаем, че е
  готово“.
Само статуси, идентификатори и броеве; никога тест. Картата се обновява по потока на разговора, както досега.
Защо: демото на 4.12 (docs/prd/demo-2026-12-04.md §4, §6, §7).
Тестове: web lib/job-strategy.test.ts (2), lib/server/job-strategy.test.ts (1), components/conversation-job.test.ts (+1).
Не е проверено на живо. Статус: решено от кодера.

## D-559 Отговорът в разговора винаги завършва с въпрос или предложение (жив тест 20.11.2026)
Решение: таванът на стъпките към модела в едно съобщение става 12 (беше 8). На последната стъпка сървърът казва на
модела, че тя е последна: без повече четене, да попита човека (ask_user) или да предложи каквото има.
Защо: на живия тест с „Пекарна“ моделът изхарчи стъпките за четене на кода и написа „трябват ми решения от теб“ без
нито един въпрос. Човекът оставаше без какво да отговори. Всяка стъпка е ограничена и от бюджета на разговора, така
че по-високият таван не прави разговора по-скъп от бюджета.
Тестове: worker conversation.test.ts (+1). Статус: решено от кодера.

## D-560 Оракул, чиято задача спре преди пускане, става „неуспешен“ с причината (жив тест 20.11.2026)
Решение: когато задачата на оракул спре, преди да стигне до пясъчника, оракулът става `failed`, а в проблемите му е
причината (`not_run: <причина>`). Такава причина е например неодобрен профил на агентите, липсващ `.mandat.yml`,
остарял харнес или неподдържан runner. Страницата тогава показва „Построй отново“.
Защо: на живия тест с „Пекарна“ новият проект още нямаше одобрени правила. Задачата на оракула спря с
`policy_missing`, а картата показваше „оракулът се пише…“ завинаги, без начин да се продължи.
Тестове: worker oracle.test.ts (+1). Статус: решено от кодера.

## D-561 Дълга спецификация стига до агента на оракула цяла (жив тест 20.11.2026)
Решение: текстът на задачата на оракула вече не се реже в края. Ако не се побира в 4000 знака, всеки критерий и всяко
непроменено поведение остават със своя номер, а дългите редове се съкращават равномерно (с „…“), докато целият текст
се събере.
Защо: на живия тест с „Пекарна“ спецификацията имаше 12 дълги критерия и 9 непроменени поведения. Отрязаният край
скриваше U-7–U-9 от агента и оракулът два пъти излезе `not_ready` с `unchanged_untagged` за тях.
Тестове: contract oracle.test.ts (+1). Статус: решено от кодера.

## D-562 Единица, несигурна само за неща, които крайната проверка решава, кацва (жив тест 20.11.2026)
Решение: единица от работа кацва в клона, ако присъдата ѝ е VERIFIED. Кацва и ако е UNKNOWN, но всички причини са
`D11:survived:` (оцеляла мутация) или `D14:slower:` (по-бавен тест). Всяко друго UNKNOWN (защитен път, мамене и т.н.)
пак спира единицата и чака човек.
Защо: единицата се проверява само срещу скритите тестове на своите критерии. Мутация, която оцелява срещу тях, е въпрос,
на който крайната проверка така или иначе отговаря: тя оценява мутациите срещу целия скрит оракул (D11.oracle, праг
0,6) и пуска D14 върху целия клон. На живия тест с „Пекарна“ склад за подаръчни карти спря цялата работа заради една
оцеляла мутация в новия файл.
Тестове: core job.test.ts (+1), worker job.test.ts (+1). Статус: решено от кодера.

## D-563 Договорът на задачата казва как се разглежда проектът (жив тест 20.11.2026)
Решение: в договора на всяка задача има нов ред: проектът се разглежда с инструментите Read, Glob и Grep, shell-ът може
да е ограничен до командите по-горе, а отказана shell команда не е причина за спиране.
Защо: одобреният профил на „Пекарна“ пуска през Bash само тестовете. Писателят на u2 опита `find` и `cat` през Bash,
получи отказ и се отказа с „не виждам проекта“. Присъдата беше `EXPORT:empty_change`, макар да има позволени
инструменти за четене. Разширяването на правата не е решение (стесняваме, не разширяваме сами); решението е да кажем
на агента кои инструменти ползва.
Тестове: contract contract.test.ts (обновен), worker run и daemon (96). Статус: решено от кодера.

## D-564 Единица, прекъсната от машината, се строи наново; картата казва, че планерът работи (жив тест 21.11.2026)
Решение:
- единица, чиято задача е спряна с `runner_offline` (работникът е спрял по средата на рън) или с `infra:*` (пясъчникът
  е паднал), не се паркира, а се пуска отново като нова задача, до RELAND_MAX + 2 пъти. Това не е провал на писателя;
- докато работата е в `planning`, картата пише, че планерът разделя работата, вместо „един писател“ по подразбиране.
Защо: на живия тест с „Пекарна“ сесията приключи, докато две единици вървяха. После едната беше спряна с
`runner_offline` и цялата работа чакаше човек. А картата, заредена преди края на планера, казваше „един писател“, макар
работата да беше във вълни.
Тестове: worker job.test.ts (+1), web conversation-job.test.ts (+1). Статус: решено от кодера.

## D-565 М4: процесът срещу един агент на същата спецификация и скрит оракул (Х10, 21.11.2026)
Решение: крайната проверка от heavy-process.md минава по истинския път, без отделна симулация.
- Работата (процесът: планер, единици, крайна проверка) е първата страна.
- `mandat compare start --job <id>` пуска втората страна: една задача, един агент, текстът е цялата одобрена
  спецификация (`specText`), а хешовете на спецификацията и на одобрения оракул са същите. Задачата минава през същия
  пясъчник, проверка и присъда, със същите скрити тестове в дърво B. По една на работа (`t_cmp_<работа>`).
- `mandat compare report --job <id>` (и `--json`) сравнява двете (`compareArms` в core, чиста функция). Решава първо
  броят минали скрити тестове, после VERIFIED присъда, после по-ниският разход, после по-краткото време. Докато някоя
  страна не е приключила, победител няма.
- D5.hidden вече пази `passed` и `total` и при провал, за да се брои (присъдата не се променя).
Граница: бюджетът не се изравнява насила. Единият агент има обичайния таван на задача и до 3 опита, а отчетът показва
разхода на двете страни един до друг. „Проверка на живия продукт“ от плана засега е само скритият оракул.
Тестове: core compare.test.ts (3), d5.test.ts (обновен), worker job.test.ts (+1). Статус: решено от кодера.

## D-570 Jarvis започва интервюто за проект (Симо 20.11.2026)
Jarvis има нова команда `start_project_interview`. Тя приема проекта и думите на човека за него. Пуска разговор с
purpose "project" (D-557) през същия `/api/conversations`, който ползва формата „Добави проект“, и отваря разговора на
екрана. Интервюто го започва гласът, но описанието на проекта го одобрява само човекът, на екрана. Гласът не получава
нова власт (D-556): командите още не одобряват, не сливат и не подписват. Командата се разпознава, а проект не е
даден → отказ „bad arguments“, нищо не се праща.
Тестове: contract voice.test.ts (списъкът с команди), web voice-tools.test.ts (+1). Статус: решено от кодера.

## D-566 Оракулът фиксира публичния интерфейс, който тества; писателите го получават (жив тест 21.11.2026)
Решение:
- агентът на оракула сам решава публичния интерфейс на новия код и го внася с точни пътища и имена. Никога не търси
  имена с `import.meta.glob`, регулярни изрази или try/catch. Записва интерфейса в `__hidden__/API.md` до тестовете, по
  един ред на функция (`- \`път\`: \`име(аргументи): резултат\` — какво прави`);
- харнесът приема `API.md` като интерфейс, а не като чужда промяна (`oracleChange.api`). Редовете му влизат в
  манифеста на оракула (`api`), значи и в хеша, който човекът одобрява. Оракул без интерфейс не е готов (`no_api`);
- всеки писател (единица на работата и единият агент в М4) получава интерфейса като изискване: „Public API the hidden
  checks use (provide exactly these exports)“. Тестовете остават скрити. Интерфейсът винаги се побира в 4000 знака,
  а ако трябва, се съкращава краят на текста.
Защо: на живия тест с „Пекарна“ скритите тестове търсеха новите функции по шаблон на името и взимаха първата, която
пасне. Затова 13 от 30 скрити теста падаха и при процеса, и при единия агент, независимо от кода. Проверката
„червено на базата“ не хваща това, защото на базата всичко пада.
Тестове: contract oracle.test.ts (+4), core oracle.test.ts (+1), worker oracle.test.ts (+1), job.test.ts (+1). Статус:
решено от кодера.
Допълнение към D-566 (жив тест 21.11.2026): с точни импорти в началото на файла модул, който още не съществува, събаря
целия тестов файл на сегашния код. Vitest не връща нито един тест и всички критерии излизат `untagged_criterion`.
Затова агентът на оракула внася новите модули вътре във всеки тест с `await import("<точен път>")`. Така файлът се
зарежда, всеки тест пада поотделно, а пътищата и имената остават точни. Тестове: contract oracle.test.ts.

## D-567 Лимитът на абонамента е лимит, а не празна промяна (жив тест 21.11.2026)
Решение: Claude Code с абонамент съобщава лимита си само в собствения си поток, като `rate_limit_event` със
`status: "rejected"` и `resetsAt`. Абонаментът минава през свой тунел и проксито не вижда 429. Сега run.ts чете това
събитие (`subscriptionLimit` в packages/agents) и го слага в `usage.limit` с `resets_at`. Оттам задачата влиза в
същата верига като 429 от проксито (E3в, packages/channels limit-chain): чака, ако лимитът се нулира скоро; иначе отива на друг канал
или чака до нулирането (`channel_limit`), а самодовършването я пуска отново.
Защо: на живия тест с „Пекарна“ петчасовият лимит на абонамента спря u3 като `EXPORT:empty_change` (паркирана, чака
човек), а единия агент като `agent_failed:unknown` (задържан). Нищо от двете не е вярно: само трябваше да се изчака.
Тестове: agents rate-limit.test.ts (1). Статус: решено от кодера.

## D-568 Агентът в пясъчника има Glob и Grep (жив тест 21.11.2026)
Решение: Claude Code в пясъчника се пуска с `--tools Bash,Read,Edit,Write,Glob,Grep`, като Glob и Grep са и в позволените
инструменти. Те само четат, както Read, който вече чете всеки файл в /m/work, затова не дават нови права.
Защо: щом профилът ограничи Bash до командата за тестове, писателят може да прочете само файл, чийто път вече знае.
На живия тест u7 на „Пекарна“ отказа работа: „Glob не съществува в тази сесия, а Read не изброява папки“. D-563 му
беше казал да ползва Glob и Grep, а те изобщо не бяха дадени.
Тестове: agents agents.test.ts (обновен), worker run.test.ts. Статус: решено от кодера.

## D-569 Една задача не събаря работника; бележката на повторен опит винаги се побира (жив тест 21.11.2026)
Решение:
- текстът на договора се сглобява с `contractText`: бележките (повторен опит, нощна смяна, steer, replay) остават цели, а
  текстът на задачата се съкращава, ако трябва, за да се побере всичко в 4000 знака;
- `runDaemonOnce` хваща грешка при обработката на една задача и спира само нея (`BLOCKED worker_error:<кратко>`), а
  работникът продължава. Загубена връзка с базата пак се хвърля нагоре, както досега (D-444).
Защо: на живия тест единият агент от М4 имаше текст близо до 4000 знака (спецификацията и API на оракула). При повторния
опит бележката го прехвърли над лимита. `sealContract` хвърли грешка и тя събори целия процес на `pnpm local`, заедно с
работата на „Пекарна“.
Тестове: worker daemon.test.ts (+2), всички тестове на работника без Docker (317). Статус: решено от кодера.

## D-571 API.md на оракула покрива всяко име, което тестовете му викат (кодер 21.11.2026)
Решение:
- `apiGaps` (apps/worker/src/online/oracle-api.ts) чете скритите тестове и намира модулите, които те зареждат с
  `await import` (директно, през `() => import(...)`, с деструктуриране или `(await import(...)).name`), заедно с всяко
  име, което тестовете викат или четат от тях;
- ако API.md пропуска поне едно такова име, `finishOracle` оставя оракула `not_ready` и записва по един проблем
  `no_api:<име>` за всяко липсващо име. Човекът вижда кои имена липсват и строи оракула отново;
- в текста на задачата за оракула (contract `oracleTaskText`) е добавено изрично: в API.md влиза всяка нова функция,
  която тестовете викат (и новите функции в съществуващи модули), и всяко ново поле, което четат.
Защо: на живия тест на „Пекарна“ API.md съдържаше само конструкторите (`createLoyalty`, `createGiftCardStore`…). Тестовете
обаче викаха `placeLoyaltyOrder`, `payLoyaltyOrder` и `payOrderWithGiftCard`. Нито u7, нито единичният агент от М4 можеха да
познаят тези имена: и двата паднаха на едни и същи 13 скрити теста, а typecheck падна при всеки опит. Работата спря
(parked). Причината не беше в агентите, а в оракула.
Граница: проверката вижда само модули, заредени динамично (D-566 ги изисква за нов код). Ново име в съществуващ модул,
внесено статично, остава задача на текста.
Тестове: worker oracle-api.test.ts (3), oracle.test.ts (+1). Статус: решено от кодера.

## D-572 След паркирана работа човек може да построи оракула отново (кодер 21.11.2026)
Решение:
- `buildOracle` вече пуска нов оракул и когато последната работа на разговора е паркирана, дори старият оракул да е одобрен.
  Докато работата върви, правилото не се променя (`work_started`). Действието е само за човек със същото право;
- при новия оракул старата работа остава паркирана и записва `oracle_superseded` в `question`, а разговорът се връща във
  фаза `conversation`. Така „Започни работата“ стартира нова работа с новия оракул;
- в картата на оракула бутонът „Направи оракула пак“ се показва и при одобрен оракул с паркирана работа, с обяснение, че спрялата
  работа остава както е.
Защо: на живия тест на „Пекарна“ две работи спряха (parked), защото оракулът им беше грешен (D-571). Продуктът нямаше начин
да продължи оттам и състоянието се оправяше на ръка в базата.
Също в D-571 (от същия тест): един елемент в API.md вече включва редовете под себе си (до 1000 знака). Оракулът беше записал
„Rules:“ на отделни редове, а там беше полето `redemptionCents`. Парсерът ги изпускаше, затова typecheck падаше и при u7, и
при единичния агент. Освен това `oracleTaskText(spec, max)` вече оставя място за бележката при повторно построяване, без да
реже последните неизменни поведения.
Тестове: web conversation.test.ts (+2), contract oracle.test.ts (+2). Статус: решено от кодера.

## D-573 Единица, чиято работа вече е свършена, минава (жив тест 21.11.2026)
Решение:
- ако агентът на единицата не е променил нищо (присъдата има само `EXPORT:empty_change`), `settleUnit` гледа D5 на последната
  кацнала единица. Всяка кацнала единица пуска всички скрити тестове. Ако всичките критерии на тази единица вече минават
  (`criteriaMet` в core, чиста функция), единицата е `passed` с handoff „нищо ново: … вече минават“ и запис
  `unit_already_done` в дневника. Клонът не мърда, нищо не каца;
- ако поне един критерий още пада, D5 липсва или списъкът с провалени тестове е стигнал лимита (50), се паркира както досега.
Защо: във втория М4 рън u1 построи и цената, която беше работа на u3. Агентът на u3 правилно не промени нищо: прочете кода, пусна
тестовете (24/24) и обясни защо. Харнесът все пак спря цялата работа за „празна промяна“, без да провери дали критериите са
изпълнени.
Също от живия тест (D-571):
- API на оракула стига и до опитите за спасяване. Досега те пишеха без него, затова u5 в първия рън гадаеше имена;
- API заема до ¾ от текста и се реже на цели елементи. Половината текст режеше API от 2349 знака на четвъртия от 9 елемента;
- паркирана работа в сравнението от М4 е завършена ръка без резултат, а не „чака“.
Тестове: core unit-done.test.ts (2), worker job.test.ts (+1, общо 24), contract job/oracle (+2). Статус: решено от кодера.

## D-574 Единицата пуска скритите тестове на своя обхват (жив тест 22.11.2026)
Решение:
- единицата получава всеки скрит файл, в който има тест на нейния обхват (критериите на кацналите единици плюс нейните) или
  тест U-n (`scopedOracleFiles` в core). Досега получаваше само файлове, в които всички критерии вече са позволени;
- D5 на единица решава само по обхвата: тестовете с таг от обхвата, U-n и тестовете без таг. Провал на по-късен критерий е
  очакван и не се брои. Ако не е минал нито един тест от обхвата, присъдата е UNKNOWN `not_run`, а не тихо минаване;
- D5 на единица записва и `met`: критериите, чиито тестове са минали изцяло навсякъде в рън-а. D-573 (`criteriaMet`) ползва
  него. Така единица, чиято работа вече е направена от по-ранна, вижда, че критериите ѝ вече минават;
- без обхват (обикновена задача, крайна проверка) D5 е както досега.
Защо: в рън 3 оракулът записа всичките 14 критерия в един файл. `oracleFilesFor` го държеше настрана до последната единица,
затова u1 и u2 кацнаха без нито един скрит тест (присъдите им нямат D5). D-573 нямаше с какво да сравни и u3 спря. Освен
това опитите за спасяване не знаеха кои критерии падат.
Тестове: core d5.test.ts (+1), unit-done.test.ts (+1), job.test.ts (+1), worker job.test.ts (обхватът стига до рън-а).
Статус: решено от кодера.

## D-575 Ръката с един агент в М4 не се доставя (жив тест 22.11.2026)
Решение: `startSingleArm` създава задача от вид `compare` (миграция 20261122000575: kind ∈ work, oracle, compare). Тя
минава през същия пясъчник, проверка и присъда, с повторните опити при FAILED. След присъдата обаче спира: при FAILED
остава `BLOCKED`, иначе става `CLOSED` с решен резултат. Не се пребазира, не се прави клон, не се слива и не се доставя.
Защо: рън 4 даде оракул, чиито 14 критерия минават на базата. Причината: единичният агент от рън 1 (VERIFIED) беше сринат в
`main` на локалния проект като обикновена задача (комит 67458b7, 21.11 20:35). Затова рънове 2–4 започнаха върху база, в
която функцията вече съществува под други имена. Затова и u1 в рън 2 „вече беше построил“ работата на u3. Папката на човека
(Desktop/bakery-shop) не е пипната; доставката е само в копието на харнеса.
Последствие: резултатите от рънове 2 и 3 за процеса не са чисти. Копието на проекта се връща на 2946932, а старият връх се
пази в ref за връщане.
Тестове: worker job.test.ts (ръката е `compare`, `CLOSED`, main не мърда, няма доставка). Статус: решено от кодера.

## D-576 `pnpm check` минава на чист клон без Electron (macOS, 22.11.2026)
Решение: `apps/desktop/src/menu.ts` вече не внася типа `MenuItemConstructorOptions` от `electron`. Вместо него има свой тип
`MenuTemplateItem`: само полетата, които `toTemplate` попълва (label, role, type, accelerator, checked, enabled, submenu,
click). Той е структурно съвместим с типа на Electron, който main.ts подава на `Menu.buildFromTemplate`.
Защо: Electron се слага при нужда (D-303), затова на чист клон няма типове за `electron`. На новия Mac `pnpm check` падна на
`tsc -p tsconfig.check.json` с TS2307 в menu.ts. На Windows не се виждаше, защото там `pnpm desktop` вече беше слагал
Electron. Самият файл казва, че е чист и без внос от Electron.
Граница: съвместимостта с истинския тип на Electron 44 не е проверена с инсталиран Electron (main.ts е извън check).
Тестове: desktop menu.test.ts (+1: menu.ts не внася `electron`). Статус: решено от кодера.

## D-577 Инсталираното приложение тръгва: пакетът носи next.config като JS (macOS, 22.11.2026)
Решение: пакетът на харнеса за десктопа (`bundle-harness.mjs`) вече слага `apps/web/next.config.mjs`, преведен от
`next.config.ts` с TypeScript (`bundledNextConfig` в bundle-plan.ts), и маха `.ts`. Next търси `next.config.mjs` преди `.ts`.
Защо: пакетът маха компилатора на Next (SWC), за да е еднакъв за всяка ОС и архитектура, с довода „трябва само на
`next build`“. `next start` обаче го ползва, за да зареди `next.config.ts`. Без него Next се опитва да свали SWC с `npm`, а в
приложението `npm` няма. Уебът слуша на :3000, но не отговаря, и прозорецът остава на „The harness is starting… 4/4“.
На новия Mac първото пускане на dmg-а от `pnpm site:mac` спря точно там. Новият пакет, пуснат с Node-а на Electron,
отговаря на /login с 200 и с заглавките от config-а.
Тестове: desktop bundle-plan.test.ts (+1: config-ът е чист JS, със същите стойности и заглавки). Статус: решено от кодера.

## D-578 Docker тестът на Gemini не бърка метриките на CLI-я с пропуснат файл (macOS, 22.11.2026)
Решение: проверката от D-431 в `gemini.docker.test.ts` търси само предупреждението за пропуснат файл:
`/insecure|Skipping [^\n]*(settings|polic)/i` вместо `/insecure|Skipping/i`.
Защо: на новия Mac тестът падаше и пуснат сам (151 s), макар че агентът е VERIFIED и харнесът е дал всичко. В stderr на
Gemini CLI имаше само `[STARTUP] Phase 'cleanup_ops' was started but never ended. Skipping metrics.` Това е телеметрията на
CLI-я при бавен старт, а не пропуснати настройки или политики. Новият израз пак хваща съобщението от D-431
(„Skipping system settings file … is insecure“) и „Skipping policy file …“.
Също от прогона на macOS (`pnpm test:docker`, 64/66 под товар): `conflict-wait.docker.test.ts` падна само докато вървеше
строежът на dmg-а. Пуснат сам, минава.
Тестове: worker gemini.docker.test.ts (2/2 в Docker). Статус: решено от кодера.

## D-579 Защо ElevenLabs отказва, се вижда в лога на проксито (жив тест, macOS, 22.11.2026)
Решение: `VoiceError` носи и `detail`: статуса и собственото съобщение на ElevenLabs. От списък с грешки на валидацията то
изглежда като „422 body.a.b: msg“, от обект с грешка като „400 status: message“, а иначе е само статусът. Дълго е до 300
знака, ключът е заменен с `[key]`, остават само печатни знаци. Проксито го пише на един ред в stderr
(`{"voice_error","detail"}`, опция `voiceLog`). Отговорът към CLI и уеба остава само кодът, затова договорът на
`VoiceAnswer` не се мени.
Защо: на живия тест „Create Jarvis“ даде само `voice_agent_create_failed`. Деветте инструмента минаха, а създаването на
агента беше отказано. Без отговора на ElevenLabs не се вижда кое от непроверените в D-556 не минава: езикът „bg“,
`eleven_v4_turbo`, LLM-ът или `scribe_realtime`. Съобщенията за грешка на ElevenLabs нямат ключ и тяло на LLM заявка
(правило 5).
Граница: всеки неуспешен опит оставя деветте инструмента в акаунта в ElevenLabs. Чистенето им е отделна работа.
Тестове: llm-proxy voice-upstream.test.ts (+2), proxy-voice.test.ts (+1). Статус: решено от кодера.

## D-580 Jarvis чува и в десктоп приложението (жив тест, macOS, 22.11.2026)
Решение: прозорецът на десктопа отваря точно това, което трябва на Jarvis (D-556), и нищо повече:
- разрешения (`allowPermission`): освен запис в клипборда, `media` само ако се иска само аудио (`mediaTypes` е само
  „audio“) и само от локалната страница. Камера, аудио+видео, празен или непознат вид не минават;
- CSP: `connect-src 'self' wss://api.elevenlabs.io` (websocket-ът на сесията, `connectionType: "websocket"`) и
  `script-src … blob:` (клиентът `@elevenlabs/client` 1.36.1 зарежда AudioWorklet-ите си от blob: URL, а worklet-ите се
  управляват от script-src). CDN-ът на libsamplerate (jsdelivr) не се отваря: трябва само на браузър без sampleRate
  ограничение за микрофона, а Chromium го има;
- Info.plist: `NSMicrophoneUsageDescription` (electron-builder `mac.extendInfo`), за да пита macOS. Ред за камерата няма.
Защо: след като Jarvis беше създаден, бутонът му в приложението казваше, че микрофонът е блокиран. Прозорецът от D-371
позволяваше само копиране, CSP-то допускаше само локалния адрес, а приложението не декларираше микрофон, затова macOS
изобщо не питаше. В браузъра (`pnpm local`) работи, защото там тези ключалки ги няма.
Граница: проксито пуска signed URL за всеки хост *.elevenlabs.io, а CSP-то — само за api.elevenlabs.io. Ако ElevenLabs върне
регионален хост, връзката ще бъде спряна и тогава хостът се добавя изрично. Гласът на живо в приложението още не е проверен.
Също: `pnpm --dir apps/desktop run build` с инсталиран Electron минава. Така е проверена и границата на D-576:
`MenuTemplateItem` пасва на типа на Electron 44.
Тестове: desktop window-guard.test.ts (+1, CSP обновен), builder-config.test.ts (+1). Статус: решено от кодера, по
одобрение на Симо („unlock narrowly“).

## D-581 Уебът позволява микрофона на Jarvis: `Permissions-Policy: microphone=(self)` (жив тест, macOS, 22.11.2026)
Решение: в заглавките на всяка страница (`apps/web/next.config.ts`) микрофонът е позволен само за същия адрес:
`camera=(), microphone=(self), geolocation=()`. Беше `microphone=()`.
Защо: и след D-580, и след „Allow“ в macOS бутонът на Jarvis казваше, че микрофонът е блокиран. На живо, през
отстраняването на грешки на приложението, се видя следното. macOS дава `granted` (`systemPreferences`). Прозорецът получава
заявка `media` с `mediaTypes: ["audio"]` от локалната страница. Дори обработчик, който позволява всичко, пак дава
`NotAllowedError`. Причината е заглавката от D-284: `microphone=()` спира микрофона за самата страница, в браузъра също.
Опит в Electron 44 със същата страница: с `microphone=()` е `NotAllowedError`, с `microphone=(self)` е `ok`. Jarvis (D-556)
не беше проверен на живо и затова това не се видя.
Граница: камерата и местоположението остават изключени; чужд iframe не може да иска микрофона (`self`, плюс
`X-Frame-Options: DENY` и `frame-src 'none'` на десктопа).
Тестове: web next-config.test.ts (1, нов: всички заглавки за сигурност). Статус: решено от кодера.

## D-582 Jarvis управлява екраните като човек, без одобрения (Симо 22.11.2026)
Симо: Jarvis да пише промптовете и да контролира всичко. Избор (въпрос в чата): „всичко без одобрения“; промптовете се
пишат видимо в полето.
Решение:
- договорът (voice.ts) има още 5 команди: `list_controls` (полетата, бутоните, връзките и изборите на екрана с id `v…`),
  `write_prompt` (пише в главното поле за промпт, без да праща), `type_text` (replace/append), `press`, `choose`. Друго име
  не минава през zod;
- правилата са чисти (`apps/web/src/lib/voice-controls.ts`). Контролът е забранен, ако е маркиран с `data-voice="never"`
  (самият бутон на Jarvis), ако е изключен, ако е във форма или близо до поле за еднократен код (всяко одобрение в UI-я иска
  TOTP), ако е поле за парола или с име на ключ/токен, или ако етикетът му е за одобрение, сливане, подпис, изтриване,
  премахване, отнемане, ключ, токен или изход (английски и български). Забранен контрол не стига до модела в
  `list_controls`, а ако бъде посочен по id, отговорът е отказ с причина;
- браузърът (`voice-dom.ts`) дава id-тата (`data-voice-id`), пише видимо (около 30 стъпки, през native setter + input
  събитие за React), натиска, избира. Главното поле за задача и разговор е маркирано с `data-voice="prompt"`;
- промптът на Jarvis: пише промпта с write_prompt, прочита го и праща с press чак на „прати“. Преди действие, което пуска
  или спира работа или сменя настройка, казва какво ще направи. Одобрения, сливане, подпис, ключове и изтриване казва на
  човека къде да натисне.
Защо: гласът става втори чифт ръце на екраните, без нова власт над това, което D-556 пази за човека и втория фактор.
Следствие: агентът в ElevenLabs трябва да се обнови с новите инструменти. Хешът на спецификацията се мени, така че
„Create Jarvis“ го обновява на място (PATCH), а старите инструменти остават в акаунта.
Граница: DOM адаптерът няма unit тестове, защото в уеба няма DOM среда. Правилата и командите са тествани; на живо не е
проверено.
Тестове: contract voice.test.ts (+2, списъкът обновен), web voice-controls.test.ts (6, нов), voice-tools.test.ts (+4).
Статус: решено от кодера по избора на Симо.
Допълнение към D-582: думите за одобрение, сливане и т.н. са в договора (`VOICE_PERSON_ONLY`, `VOICE_SECRET_NAME` във
voice.ts). В apps/web/src кирилица има само в каталога (E7е), а тестът `no-hardcoded-strings` хвана първата версия.

## D-583 Разговорите от „Ask first“ са в списъка със задачи (жив тест, 22.11.2026)
Решение: лявата колона показва и разговорите, които още не са задача или работа (`openConversations` в
lib/server/conversation.ts: без `task_id` и `job_id`, най-новите 50). Заглавието е първото, което човекът е написал;
етикетът е „Разговор, чака теб“ (idle) или „Разговор, харнесът отговаря“, а за интервюто на проект „Опознаване на
проекта“. Подредбата е по време, заедно със задачите (`mergeByTime`). Разговор, който вече е ред на работа, не се
повтаря (`openConversationsToList`).
Защо: на живия тест Jarvis пусна два разговора за ресърч. Харнесът зададе въпроси и чакаше човека, но разговорите не
бяха никъде в списъка, защото той показваше само задачи и работи. След като човекът излезе от разговора, той изглеждаше
незапазен, а Jarvis беше казал „пуснато“. Разговорите си бяха в базата (`public.conversations`, фаза conversation, idle).
Тестове: web task-list.test.ts (+3), conversation.test.ts (+1). Статус: решено от кодера.

## D-584 Jarvis: кратък, прекъсва се веднага, пише силни промптове, има ресърч и настройки (Симо 22.11.2026)
Симо след живия тест: промптовете му са слаби; няма инструменти за ресърч и настройки; каза „чака одобрение“, а беше
„пуснато“; бъбри много; трябва да може да бъде прекъснат веднага, „като истински Jarvis“.
Решение:
- агентът в ElevenLabs: `turn.turn_eagerness: "eager"` (отговаря щом човекът спре), `turn.speculative_turn: true`
  (започва отговора в паузата), `agent.disable_first_message_interruptions: false` (и поздравът се прекъсва; иначе
  прекъсването е включено по подразбиране), `tts.speed: 1.1`. Поздравът е „Тук съм. Слушам.“;
- промптът е пренаписан: обикновено едно изречение до 15 думи, без увод, без да разказва какво прави с инструментите;
  спира веднага, щом бъде прекъснат; казва само каквото инструментът е потвърдил („пуснато“ само след „The work
  started“); въпрос за света → `start_research`, никога разговор за код; рецепта за силен промпт (цел, контекст, проверими
  критерии „КОГА … ТРЯБВА …“, какво не се мени, ограничения; без измислени изисквания; един кратък въпрос, ако липсва нещо);
- нови инструменти: `start_research` (POST /api/research, goal balanced, отваря /research), `research_result`
  (отчетът в JSON или „not ready“), `stop_research`, `list_models` (GET /api/connections), `set_defaults` (PUT
  /api/preferences: агент, модел, ask_first/work_now; празен е отказ). Останалото (памет, нощна смяна, системните екрани)
  минава през ръцете от D-582.
Защо: на живия тест Jarvis пусна ресърч като разговор за код без проект (D-583), каза „пуснато“ за разговор, който чакаше
отговори, и говореше дълго.
Факти (elevenlabs.io/docs/api-reference/agents/create, прочетено 22.11.2026): turn.turn_eagerness patient|normal|eager
(по подразбиране normal); turn.speculative_turn bool (false); agent.disable_first_message_interruptions bool (false);
tts.speed double (1). [НП]: допустимият обхват на tts.speed; агентът трябва да се обнови с „Create Jarvis“ (хешът се мени).
Тестове: contract voice.test.ts (+2, списъкът обновен), llm-proxy voice-upstream.test.ts (+1, обновен), web
voice-tools.test.ts (+3). Статус: решено от кодера.
