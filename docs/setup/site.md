# Сайтът за изтегляне и документацията (`apps/site`) — как го пускаш (стъпки за Симо)

`apps/site` е статичен сайт (Next с `output: "export"`, D-377, D-378): страниците `/`, `/download/`, `/docs/…` на английски
и същите под `/bg/`. След build всичко е в **`apps/site/out`** — обикновени HTML, CSS, JS, шрифтове и PNG. Сървър не трябва,
нищо не се праща към нас (без аналитика, бисквитки и външни заявки — тестът `apps/site/src/export.test.ts`).
Нищо не е деплойнато нощес (правило 3): деплоят е твой ход.

Страниците на GitHub Pages и Vercel не са отваряни нощес: менютата и имената на полетата по-долу са [НП] — провери ги, докато
минаваш през тях.

## 1. Построй го и го виж локално
```sh
pnpm install --frozen-lockfile
pnpm --filter @mandat/site build        # → apps/site/out (строи и @mandat/contract, ако трябва: pnpm build)
pnpm --filter @mandat/site serve        # → http://127.0.0.1:3101/ (само 127.0.0.1)
```
Проверки преди деплой:
- `pnpm check` → `CHECK OK` (вътре са тестовете на export-а: всяка страница в двата езика, линковете, котвите, без външни заявки).
- `pnpm --filter @mandat/site e2e` → axe 0 serious/critical на всяка страница в тъмна и светла тема, без хоризонтален скрол на
  375 px, светлата снимка в светла тема. Ползва Chromium-а на Playwright; ако не е свален, `MANDAT_CHROMIUM=<път до Chrome>`.

## 2. Преди издание: линковете за изтегляне
Без издание `/download/` казва „Скоро“ на всеки ред. Когато публикуваш издание в GitHub Releases (Q-054):
```sh
node scripts/release-manifest.mjs --dir <папката с инсталаторите> --version <x.y.z>   # пише apps/site/releases.json
pnpm --filter @mandat/site build
```
Манифестът трябва да е на **последното** издание (линковете са `releases/latest/download/<файл>`, D-377).

## 3. Снимките на UI-я в документацията
Те са истински екрани на харнеса (`apps/site/public/shots`, 5 екрана × en/bg × тъмна/светла). Когато UI-ят се промени:
```sh
pnpm build
node scripts/site-shots.mjs                               # временна база mandat_shots с демо данните; трябва Postgres-ът на pnpm local (127.0.0.1:54329)
node scripts/site-shots.mjs --url http://127.0.0.1:3000   # или срещу работещ pnpm local (внимание: снима ТВОИТЕ задачи — Q-065)
```
Екраните са изброени в `apps/site/shots.json`. Скриптът не дава на уеб сървъра ключове и изтрива временната база накрая.

## 4а. GitHub Pages
Пътищата в сайта са абсолютни (`/fonts/…`, `/_next/…`), затова работи **в корена на домейн**. На
`simosabev.github.io/AI-Harness-NOIT/` (под-път) шрифтовете и скриптовете се чупят — виж Q-064 (`basePath`, ~1 час).
1. Собствен домейн (напр. `harness.example`) или отделно хранилище `<user>.github.io`, за да е коренът.
2. Repo → Settings → Pages → Source: **GitHub Actions** [НП].
3. Workflow (не е в репото, защото правило 3 забранява деплой от нощната работа): checkout → pnpm install → `pnpm build` →
   `actions/upload-pages-artifact` с `path: apps/site/out` → `actions/deploy-pages` [НП: точните версии на действията].
4. Ако качваш `out/` в клон `gh-pages` вместо през Actions, сложи празен файл `out/.nojekyll`: Jekyll пропуска папки, които
   започват с `_`, а скриптовете на Next са в `_next/` [НП].
5. Custom domain в Settings → Pages + DNS запис (CNAME към `<user>.github.io`) [НП].

## 4б. Vercel
1. New Project → избери хранилището; **Root Directory: `apps/site`** [НП].
2. Framework: Next.js. Build Command: `npx turbo run build --filter=@mandat/site` (turbo строи и `@mandat/contract`, от който
   сайтът зависи); Output Directory: `out` [НП: дали Vercel сам познава `output: "export"` и пуска командата от корена].
3. Install Command: `pnpm install --frozen-lockfile`; Node 24 (Project Settings → Node.js Version) [НП].
4. Домейн: Project → Domains. Сайтът е в корена, така че Q-064 не пречи.
5. Не включвай Vercel Analytics / Speed Insights: сайтът обещава „без аналитика и бисквитки“ (футърът и тестът).

## 5. След деплоя
- Отвори `/`, `/download/`, `/docs/verdicts/`, `/bg/docs/` — в DevTools → Network не трябва да има заявка към друг хост.
- Смени темата на системата: диаграмите и снимките трябва да следват светлата и тъмната тема.
