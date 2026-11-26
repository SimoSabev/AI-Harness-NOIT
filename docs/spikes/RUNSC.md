# Спайк RUNSC — `MANDAT_SANDBOX_RUNTIME=runsc|sbx`, rootless + runsc, microVM при hosted (v5 т. 6.2, E10)

Статус: **само спайк, [НП]** (26.11.2026). Кодът на пясъчника и `SANDBOX_HARDENING` НЕ са променени; по подразбиране
остава runc. Решение D-706. Пробата: `node spikes/runsc-probe.mjs` (чете `docker info`, търси `runsc` и `sbx`; на хост с
runsc пуска два временни alpine контейнера с истинските флагове на `SANDBOX_HARDENING` под `--runtime=runsc`).

## Какво показа пробата на тази машина (macOS arm64, Docker Desktop, 26.11.2026)
```
docker runtimes: io.containerd.runc.v2, runc (default runc), kernel 7.0.14-linuxkit, rootless: false
runsc CLI: няма · sbx: няма · gvisor: пропуснато (няма runsc в docker info)
```
`docker sandbox --help` на Docker 29.9.3 отговаря „"docker sandbox" is deprecated and has been removed … migrate to Docker
Sandboxes“ (изходът на командата, 26.11.2026). Т.е. на macOS днес нито runsc, нито sbx могат да се пробват докрай.

## Факти от документацията (прочетени 26.11.2026)
| Факт | Източник |
| --- | --- |
| gVisor изисква Linux (5.6+), x86_64 и ARM64; macOS/Docker Desktop не е описан като хост | https://gvisor.dev/docs/user_guide/install/ , https://gvisor.dev/docs/user_guide/FAQ/ |
| `runsc install` регистрира Docker runtime „runsc“ в daemon.json; после рестарт (quick start) или reload (install) на dockerd — двете страници се разминават [НП] | https://gvisor.dev/docs/user_guide/quick_start/docker/ , https://gvisor.dev/docs/user_guide/install/ |
| Пускане: `docker run --runtime=runsc …`; `dmesg` вътре показва „Starting gVisor…“ (документацията предупреждава, че това не е доказателство за сигурност) | https://gvisor.dev/docs/user_guide/quick_start/docker/ |
| Страницата за инсталиране казва, че автоматичното сваляне в `runsc install` отпада в края на септември 2026 → пътят на инсталиране трябва да се провери наново [НП] | https://gvisor.dev/docs/user_guide/install/ |
| **DNS не работи в user-defined bridge мрежа (вкл. Compose)**: вграденият DNS 127.0.0.11 е недостъпен | https://gvisor.dev/docs/user_guide/FAQ/ |
| Rootless: три начина; `runsc --rootless` без `create` и без Netstack; userns от извикващия (rootlesskit) с Netstack през TAP+Slirp; нативният rootless — без network namespaces | https://gvisor.dev/docs/user_guide/rootless/ |
| Платформи: systrap по подразбиране; KVM само с /dev/kvm (bare metal или nested virt) | https://gvisor.dev/docs/user_guide/platforms/ |
| Docker Sandboxes (`sbx`): microVM със свое ядро и свой Docker Engine за всеки агент; `sbx run claude`; macOS 14+ Apple silicon, Windows 11, Ubuntu 24.04+ с KVM; не иска Docker Desktop | https://www.docker.com/products/docker-sandboxes , https://docs.docker.com/ai/sandboxes/install/ , https://docs.docker.com/ai/sandboxes/architecture/ |
| `sbx` не документира docker-run флагове (`--read-only`, `--cap-drop`, `--network`); има „Agent Kits“ (образ, entrypoint, мрежа) | същите страници |

## Изводи
1. **runsc с днешната мрежа на пясъчника не тръгва както е.** Агентът стига до вратата като `http://egress-gate` по
   име в `--internal` мрежа; под gVisor вграденият DNS не работи. Нужно е: IP на вратата в `--add-host` (вече знаем IP-то
   на контейнера ѝ) или монтиран `resolv.conf`. Това е промяна в packages/sandbox + egress-gate → отделна фаза с червен
   отбор (R14, R19, R20 под runsc).
2. **runsc + rootless Docker (VPS, docs/setup/vps.md)**: документирано е през userns на извикващия (метод 2), но с
   Netstack през TAP+Slirp — неизпробвано [НП]. Комбинацията с `--network` на Docker е най-рисковата част.
3. **Флаговете на SANDBOX_HARDENING под runsc** (`--read-only`, tmpfs, `--sysctl net.ipv6…`, `--ipc=private`,
   `--pids-limit`) — не са описани на прочетените страници [НП]; пробата ги проверява на Linux хост с runsc.
4. **sbx** е друг модел: агентът е вътре в microVM със собствен Docker, а не наш контейнер с наши флагове. Пасва на
   „недоверено репо/MCP“ като цяла кутия, но вратата, проксито и износът (И1–И6) трябва да живеят извън нея → това е
   отделен адаптер, не стойност на флаг. За hosted (Linux VPS) изисква KVM.
5. **microVM при hosted**: на VPS без nested virt KVM няма; Firecracker/Kata/sbx искат /dev/kvm. Практичният ред:
   (а) runc + rootless + SANDBOX_HARDENING днес; (б) runsc (systrap, без KVM) за недоверени репота/MCP след промяната
   на DNS-а към вратата; (в) microVM (sbx или Kata) само на хост с KVM (bare metal или VPS с nested virt).

## Какво чака (чеклист ред 38)
На Linux хост с Docker и `runsc install`: `node spikes/runsc-probe.mjs` → JSON с `flags_accepted`, `starting_gvisor`,
`dns_by_name_on_user_network`. Очакване по документацията: първите две true, третото false. После — решение дали да
се прави `MANDAT_SANDBOX_RUNTIME=runsc` (флагът ще добавя само `--runtime=runsc` и `--add-host egress-gate:<ip>`,
без да маха нищо от SANDBOX_HARDENING).
