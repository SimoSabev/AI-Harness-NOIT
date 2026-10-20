# GitHub App-ове „Мандат Writer“ и „Мандат Observer“ — чеклист за Симо

Локалният заместител е `fakeGitHub()` (packages/gate-github/src/fake.ts): налага ruleset-а, 409 при разминат sha, 422 при съществуващ ref.

## 1. Writer (пише: клонове, PR, check runs)
GitHub → Settings → Developer settings → GitHub Apps → New GitHub App.
- Name: `Мандат Writer` (или `mandat-writer-<you>`), Homepage: адресът на apps/web (или https://example.invalid).
- Webhook: Active = on, URL `https://<VPS>/api/webhooks/github/writer` (без VPS — изключи; polling работи), Secret = случайни 32+ байта.
- Repository permissions: Contents **Read & write**, Pull requests **Read & write**, Checks **Read & write**,
  Commit statuses **Read & write**, Metadata **Read**. БЕЗ Workflows и БЕЗ Administration.
- Subscribe to events: Check run, Check suite.
- Where can this be installed: Only on this account. Create → Generate a private key (.pem, остава само при теб).
- Install App → само в хранилището от GITHUB_DEMO_REPO → запиши Installation ID (числото в URL-а на инсталацията).

## 2. Observer (само чете + webhooks)
- Repository permissions: Contents **Read**, Pull requests **Read**, Checks **Read**, Commit statuses **Read**, Metadata **Read**, Actions **Read**.
- Webhook URL `https://<VPS>/api/webhooks/github/observer`; events: Push, Pull request, Merge group, Check run, Check suite, Workflow run, Status.

## 3. Env (имена; стойностите — само в env на worker-а и в твоя терминал за live тестовете)
GITHUB_WRITER_APP_ID, GITHUB_WRITER_PRIVATE_KEY, GITHUB_WRITER_INSTALLATION_ID, GITHUB_WRITER_WEBHOOK_SECRET,
GITHUB_OBSERVER_APP_ID, GITHUB_OBSERVER_PRIVATE_KEY, GITHUB_OBSERVER_INSTALLATION_ID, GITHUB_OBSERVER_WEBHOOK_SECRET, GITHUB_DEMO_REPO.

## 4. Проверка
`pnpm test:live` (docs/setup/live-tests.md) → L1 (check run на тестов PR), L2 (merge със стар sha → 409), L3 (ruleset блокира при action_required).
