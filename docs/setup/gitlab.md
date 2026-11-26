# GitLab — чеклист за Симо (E9е, D-662)

Порт: `gitlabPort` в packages/gate-github/src/gitlab.ts. Това е същият `GitHubPort` над GitLab REST v4. Офлайн
заместителят е `fakeGitLab()` (gitlab-fake.ts). Worker-ът още не ползва GitLab за проекти. Засега това са само live
тестовете GL1–GL3; после идва „Добави GitLab проект“ (D-331).

1. Тестов проект на gitlab.com (или твой GitLab): Settings → Merge requests → **Pipelines must succeed** = on. Без
   това двата статуса на Мандат не са задължителни и нивото не минава 1.
2. Settings → Access tokens → project access token, роля Developer (или Maintainer за сливане в защитен клон), scope
   **api**, кратък срок. Токенът стои само в терминала ти, никога в `.env`.
3. Отвори MR от клон с един комит; запиши iid-а (числото в `/-/merge_requests/<iid>`).
4. `GITLAB_TOKEN=… GITLAB_DEMO_PROJECT=<група>/<проект> MANDAT_LIVE_MR=<iid> pnpm build && pnpm test:live`.
   За self-managed: `GITLAB_URL=https://gitlab.<твоят домейн>`.
5. Прати на кодера `test-results/live.json`. GL3 затваря [НП] „external statuses влизат в pipeline must succeed“.
