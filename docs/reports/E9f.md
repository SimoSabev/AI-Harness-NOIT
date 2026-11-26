# Доклад E9е — подписани комити, revert → стълба, GitLab (26.11.2026)

## Статус: ГОТОВО (live чака Симо)
Решения D-660…D-663. Миграция `20261126000660_revert_outcome.sql`.

- **Revert → стълба (AC-9.5, D-660).** Observer webhook-ът (`push`) се записва в `sync_events` без текстовете на комитите;
  `findReverts` хваща `git revert` („This reverts commit <sha на сливането>.“) и бутона Revert на GitHub
  („Reverts <repo>#<n>“ / „Revert "<заглавие>"“) в 7 дни от сливането. Резултат: `outcomes` failure (reason `revert`,
  един на промяна), стъпка `failure` по стълбата (s_up −1,099, s_down +1,099; при праг 3,5 нивото пада), ред в дневника,
  активност на картата и известие „Върната (revert)“. `mandat worker` вдига webhook сървъра само с
  `GITHUB_OBSERVER_WEBHOOK_SECRET`.
- **Подпис при локално прилагане (D-661).** SSH ключ на харнеса в `$MANDAT_HOME/keys` (0600), извън пясъчника (пясъчникът
  отказва такъв mount). Комитите `mandat/<задача>-a<n>` и одобрените правила се подписват; `%G?` = `G mandat@localhost`.
  `MANDAT_SIGN_COMMITS=0` изключва. gitsign/Rekor — M3.
- **Writer App „Verified“ (D-663).** Live тест L4; SKIPPED без App-а; ред 37 в чеклиста, docs/setup/github-apps.md §5.
- **GitLab порт (D-662).** `gitlabPort` = същият `GitHubPort` (MR, pipelines, статусите „Мандат verdict/approval“);
  `deliver`/`autoMerge`/`humanApproved` вървят без промяна върху `fakeGitLab`. Live GL1–GL3 SKIPPED без токен.
  Фактите за GitLab API са с линк и дата; непровереното е [НП] в D-662.

## Готово, когато
| Ред | Реален изход | |
| --- | --- | --- |
| AC-9.5 с fakeGitHub | worker revert.test.ts 4/4 (+ revert.test.ts 9, observer 2, forge 4) | ✓ |
| L4 live | SKIPPED: няма GITHUB_WRITER_* (чеклист 37) | чака Симо |
| GitLab fake + live | gitlab.test.ts 9/9; gitlab.live.test.ts 3 SKIPPED (чеклист 38) | ✓ / чака Симо |
| Подпис SSH | signing.test.ts 4/4 | ✓ |
| `pnpm check` | всички стъпки минават (26.11.2026, довършено от друга сесия): 2769 теста ✓; при натоварване 15 таймаутът на `ledger.test.ts` property (не е пипан тук) падна веднъж и мина сам 17/17 за 12 s; `licenses ok` след `pnpm --dir apps/desktop install` в worktree-то | ✓ |

## Не е направено (граница)
- Worker-ът още не избира GitLab за проект (`repos.provider` е `local|github`), няма GitLab webhook и UI „Добави GitLab
  проект“ — по D-331 след GL1–GL3.
- Revert без следа в текста (ръчно върнат файл) не се хваща; дърветата не се сравняват.
- Revert на локален проект не се следи (няма push webhook за огледалото).

## Схема
```mermaid
flowchart LR
  A[Задача ниво 2] --> B[deliver + autoMerge<br/>GitHubPort]
  B -->|GitHub| C[octokitGitHub<br/>Writer App, L4 Verified]
  B -->|GitLab| D[gitlabPort<br/>MR, pipelines, statuses]
  B --> E[finishOutcome<br/>outcomes success, стълба +]
  F[push към main<br/>Observer webhook] --> G[observerRecorder<br/>sync_events без текстове]
  G --> H[findReverts<br/>7 дни, sha / Reverts #n / заглавие]
  H --> I[outcomes failure reason=revert]
  I --> J[стълба −1,099<br/>ladder_events, ledger]
  I --> K[известие „Върната (revert)“]
  L[Локален проект] --> M[deliverLocal<br/>commit -S със SSH ключа на харнеса]
  M --> N[mandat apply ff-only<br/>подписът остава]
```

## Разход API: $0
