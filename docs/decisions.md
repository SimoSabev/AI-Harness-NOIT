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
