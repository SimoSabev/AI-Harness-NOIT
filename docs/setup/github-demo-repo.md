# Демо хранилище `mandat-demo/shop` — чеклист за Симо

Локален заместител: fixtures/demo-shop + `pnpm mandat fixtures build --name demo-shop` (огледало, служи и като `--remote file://…`).

1. `pnpm mandat demo export-repo --out /tmp/shop` (E4) или ръчно: копие на fixtures/demo-shop с `git init` и един комит.
2. Създай празно публично хранилище `mandat-demo/shop` в GitHub и пушни `main` от своя терминал.
3. Settings → Rules → Rulesets → New branch ruleset за `main`:
   - Enforcement: Active; Bypass list: празен.
   - Restrict deletions; Block force pushes; Require a pull request before merging.
   - Require status checks to pass: „Require branches to be up to date before merging“ = **on** (strict, ниво ≥ 2 го иска);
     checks: `Мандат verdict` и `Мандат approval`, източник = App-ът Writer (integration_id = GITHUB_WRITER_APP_ID).
4. Инсталирай двата App-а само в това хранилище (docs/setup/github-apps.md). GITHUB_DEMO_REPO=mandat-demo/shop.
5. Проверка: отвори PR, който трие тест M → в PR трябва да се появи „Мандат verdict: failure“, докато CI е зелен.
