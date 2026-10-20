# Сигурност в E0

## Инварианти и как са проверени
| | Инвариант | Как се пази | Проверка |
| --- | --- | --- | --- |
| И1 | Агентът никога не държи истински ключ | ключът е само в env на `mandat-llm-proxy`; в пясъчника `ANTHROPIC_API_KEY=mdt_…` (HMAC, D-009); `mandat run` маха ключа от своя env (D-008); тайните са само `-e NAME` в argv (D-043) | unit: „ANTHROPIC_API_KEY се маха“, „тайни не са в argv“, buildRunArgs/buildProxyRunArgs; docker: gate→прокси→stub (sk-ant-… → 401); R8(б): `anthropic_api_key_prefix = mdt_`, 0 ключа в пясъчника |
| И2 | Агентът никога не пушва | в пясъчника няма .git/кредити; мрежа само към gate-а; E0 няма push | R5 gitdir; R14 8/8 |
| И3 | Промените излизат само през безопасния износ | tar → scanTar (symlink/hardlink/device/fifo/.git/.gitmodules/traversal/UTF-8/размери) → чист git (attr.tree, hooks, fsmonitor, autocrlf) → tree_sha + diff; recompute преди и след проверката | export unit + property (25 runs); R5 ×3; R6 |
| И4 | Всичко се записва | task_created, memory_snapshot, verdict за всеки run; warn/incident събитията стават security_event (D-042); верига JCS + sha256 | ledger property (200 runs); verify-log хваща подмяна (демото) |
| И5 | Мрежата е само gate-ът, вкл. DNS; CONNECT → 403; тестове с --network none | internal мрежа + gate (allowlist метод+път, собствен DNS, D-045); тестовете без мрежа | R14 8/8 на живо; docker: gate DNS, AAAA, install през gate, затворена фаза |
| И6 | Конфигурацията от репото е данни | `--bare`; договорът по хеш през `--append-system-prompt-file`; D3 за protected пътища/полета | contract unit; B5 → UNKNOWN; D3 тестове |

## Docker конфигурация (т. 8.2)
Всеки пясъчник: `--cap-drop=ALL --security-opt=no-new-privileges --read-only`, tmpfs `/tmp` и `/home/agent` с изрично
`exec` (D-104), `--pids-limit=512 --memory=2g --memory-swap=2g --cpus=2`, `--ulimit nofile=4096:4096`, `--ipc=private`,
`--sysctl net.ipv6.conf.all.disable_ipv6=1` (само ако ядрото има IPv6, D-152), `--log-driver=none`, labels mandat.run/role,
`--user 1000:1000` (seed на contract.txt: 0:0). Забранени (unit тест): --privileged, --cap-add, host мрежа, publish,
docker.sock, bind на $HOME или предшественик, всеки rw bind; позволени bind-ове: ro файлове под `${runDir}/etc/` и за gate
точно D-118 (+ ro CA файл по D-150).
Режими (D-034): rootless → gate/proxy като 0:0 (= потребителят на хоста); rootful и Docker Desktop → `$(id -u):$(id -g)`.

## Пътят на ключа
`ANTHROPIC_API_KEY=… pnpm mandat proxy start` → env на процеса `docker` → `-e ANTHROPIC_API_KEY` → контейнер
`mandat-llm-proxy` (публикуван само admin портът на 127.0.0.1). Gate-ът препраща `/v1/messages` към проксито;
проксито сменя `mdt_…` с ключа, брои разхода, спира при бюджет и отнема токена след run-а.

## Закрепване по integrity
- Claude Code 2.1.302: главният tgz и native binary-то (linux-x64/arm64) по sha512 (D-056), сверени в Dockerfile-а.
- node:24.22.0-bookworm-slim по digest на OCI индекса (D-058, D-146); gitleaks образът по digest (D-145).

## Известни граници
- Код от head може да подправи собствения си отчет във VERIFY (тестовете вървят в пясъчник, но отчетът е техен).
- Честността на фаза 1 е толкова, колкото е здрав пясъчникът; kernel-ът е споделен (няма gVisor в E0).
- Ключът в env на проксито се вижда в `docker inspect` и е в конфигурацията на Docker на диска (D-055). E1: ключ в tmpfs
  файл с `MANDAT_PROXY_KEY_FILE`.
- Облачната сесия, в която е строен E0, е rootful Docker с cgroup v1 и ядро без IPv6 (D-148, D-152); rootless + cgroup v2
  трябва да се потвърди на целевата машина (`pnpm test:docker`).
- D-140 стеснява redaction в два случая (вградени run ID-та, `NAME=value` с безобидна стойност) — за преглед.
