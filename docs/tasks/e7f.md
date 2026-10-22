# E7е — езиков каталог, английски по подразбиране (v5 т. 3.6, phase/e7f-i18n)
- [x] apps/web/src/i18n/i18n-catalog.test.ts (en и bg с еднакви ключове; без празни; всеки `{param}` от en е и в bg; избор на език бисквитка → Accept-Language → en; множествено число и Intl)
- [x] apps/web/src/i18n/no-hardcoded-strings.test.ts (кирилица в apps/web/src извън каталога, тестовете и lib/sample.ts → провал; самопроверка на скенера)
- [x] apps/web/src/lib/*.test.ts (статус, присъда, стълба, inbox, проекти/ритъм, агенти, правила, нощен план, prefs, brand: английски по подразбиране + български)
- [x] packages/cli/src/i18n.test.ts, packages/cli/src/tui.test.ts (TUI на английски; `MANDAT_LANG=bg` → български)
- [x] apps/desktop/src/i18n.test.ts, apps/desktop/src/banner.test.ts (каталог, `MANDAT_LANG`/системен локал, банерът на двата езика)
- [x] apps/web/e2e/inbox.spec.ts, board.spec.ts, harness.spec.ts, settings.spec.ts, workbench.spec.ts (на английски; превключвател на езика)
- [x] apps/web/e2e/lang-bg.spec.ts (бисквитка lang=bg: inbox → карта → одобри на български; Accept-Language bg; бисквитката печели)
- [x] apps/web/e2e/a11y.spec.ts (axe: 0 serious/critical на двата езика × двете теми)
Готово, когато:
- [x] AC-12.10: 0 низа извън каталога (статичен тест), e2e на двата езика за inbox → карта → одобри
- [x] U7: английски по подразбиране, български; един каталог; локал за дати/числа (Intl); двуезичен речник (docs/glossary.md)
- [x] README.en.md (кратко)
- [x] снимките на английски: demo/screenshots/*.png (tasks, new-task, task-failed, task-review-dark), пресъздадени срещу e2e базата
