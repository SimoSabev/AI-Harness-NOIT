# Доклад E7е — езиков каталог, английски по подразбиране (22.10.2026)

## Статус: ГОТОВО
| Част | Решение | Проверено |
| --- | --- | --- |
| Каталог | `apps/web/src/i18n/{en,bg}.ts`: en е източникът (`Key = keyof typeof en`), bg е `Record<Key, string>`; `{param}` шаблони; `.one/.other` с Intl.PluralRules (D-348) | i18n-catalog.test.ts |
| Език | бисквитка `lang` → Accept-Language → en; `<html lang>`, metadata и manifest го следват; `getT()` на сървъра, `useT()` в клиента | unit, e2e |
| Без низове извън каталога | кирилица в apps/web/src извън каталога, тестовете и lib/sample.ts → провал (и коментарите) | no-hardcoded-strings.test.ts |
| Intl | дати, часове, числа, долари и относително време по локал (en-GB / bg-BG) | status.test.ts, overview.test.ts, i18n-catalog.test.ts |
| Превключвател | /settings → „Language“ (бисквитка `lang`, `router.refresh()`) | settings.spec.ts |
| TUI и десктоп | `packages/cli/src/i18n.ts`, `apps/desktop/src/i18n.ts`: `MANDAT_LANG`, иначе системният локал, иначе en | cli/desktop unit |
| Push | sw.js рендерира заглавието и думата на присъдата на езика на устройството | ръчно (няма тест на SW) |
| Документи | docs/glossary.md (речник на PRD 4.1), README.en.md | — |

## Готово, когато
| Ред | Реален изход | |
| --- | --- | --- |
| `pnpm check` (build, lint, typecheck, test, test:counts, licenses, no-dotenv) | exit 0; unit 681 passed, 1 skipped (D-276, отпреди), 146 файла; lint, typecheck, test:counts, licenses, no-dotenv — ok | ✓ |
| `pnpm test:e2e` (MANDAT_E2E_DB_URL=…:5432/mandat_e2e_i18n) | 23 passed (1.5m): inbox/board/harness/settings/workbench на английски, lang-bg (2), axe × 4 (en/bg × светла/тъмна) | ✓ |
| AC-12.10 | 0 низа извън каталога; e2e inbox → карта → одобри на en (inbox.spec.ts) и bg (lang-bg.spec.ts) | ✓ |
| U7 | английски по подразбиране, български; един каталог; Intl; речник | ✓ |
| Снимките в docs/ | demo/screenshots/*.png са пресъздадени на английски (Playwright срещу e2e базата); текстовете на задачите са seed данни на worker-а (български) | ✓ |

## Остава (извън обхвата, паралелна работа)
- Payload-ът на push в apps/worker/src/online/push.ts още носи българските думи; sw.js ги разпознава и показва на езика на
  устройството. Чистото решение (worker праща кодове, не думи) е за фазата, която пипа worker-а.
- Съдържанието на lib/sample.ts (етикетиран пример) е на български и не се превежда (D-348): изчезва с истинските данни.
- `pnpm local` (packages/cli/src/commands/local.ts) печата банера на български; десктопът го разпознава и на двата езика.

## Разход API: $0
