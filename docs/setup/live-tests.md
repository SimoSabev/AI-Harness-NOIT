# Live тестове — пуска ги Симо

Кодерът не зарежда GitHub/VAPID ключове в своята среда (т. 0.5). Без нужните env тестовете са SKIPPED и не се броят за минали.

```sh
export GITHUB_DEMO_REPO=mandat-demo/shop GITHUB_WRITER_APP_ID=… GITHUB_WRITER_INSTALLATION_ID=… GITHUB_WRITER_PRIVATE_KEY="$(cat writer.pem)"
pnpm build && pnpm test:live          # отчет: test-results/live.json
cp test-results/live.json reports/live-$(date +%F).json
```
Тестове: L1 check run на тестов PR; L2 merge със стар sha → 409; L3 required „Мандат verdict“ с action_required блокира
сливането (ако не → D-209 резервата `failure`) и `context` = името на check run-а. TSA: MANDAT_LIVE_TSA=1 TSA_URLS=….

E9е (D-662, D-663):
```sh
# L4: same GITHUB_* env as above; a Writer App commit through REST must be „Verified“
export GITLAB_TOKEN=… GITLAB_DEMO_PROJECT=group/project MANDAT_LIVE_MR=1   # GITLAB_URL по избор (по подразбиране https://gitlab.com)
pnpm build && pnpm test:live
```
GL1 MR → PullInfo и статус „Мандат verdict“ без дубликат; GL2 merge със стар sha → 409; GL3 при „Pipelines must succeed“
failed „Мандат verdict“ блокира сливането (docs/setup/gitlab.md).
