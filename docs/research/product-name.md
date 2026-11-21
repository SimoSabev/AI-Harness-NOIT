# Световно име за продукта и гласа

Ресърч, 21.11.2026. Заменя посоката на `voice-name.md`. Симо (21.11): „нищо не звучи като нещо на пазара или като
харнес… не искам нещо на бг, искам име за световен продукт, който всеки програмист да може да използва“.

Какво трябва да носи името. Мандат е харнес: AI агенти пишат код в пясъчник, а харнесът ги води, проверява работата им и
дава присъда D1–D4. Гласът представя екраните, казва какво чака човека, пуска задачи и насочва агент. Никога не одобрява,
не слива и не подписва: това е на човека, с TOTP (D-556, D-570). Образът: **въжета и водене, а не волан**.

## 1. Пазарът: как се казват

Домейните в колоната са проверени като заети/в употреба през регистъра (21.11.2026). Метафорите и бележките са по памет [НП],
освен където има линк в §7.

| Име | Срички | Дума или измислена | Метафора / смисъл | Домейн | CLI / „hey X“ | Какво работи |
|---|---|---|---|---|---|---|
| Claude Code | 2+1 | име + дума | моделът + „код“ | claude.com | `claude` | марката на модела носи всичко |
| Codex | 2 | стара дума | кодекс, книга с правила | openai.com | `codex` | кратко, звучи техническо |
| Cursor | 2 | дума | курсорът в редактора | cursor.com | `cursor` | обикновена дума, взела .com |
| Devin | 2 | мъжко име | „AI инженер“ като човек | devin.ai | „ask Devin“ | човешко име = колега |
| Windsurf | 2 | съставна | лекота, скорост | windsurf.com | — | движение, свобода |
| Copilot | 3 | дума | вторият пилот | github.com | „Copilot, …“ | ролята е в името: помага, не командва |
| Aider | 2 | игра на думи | aide + AI | aider.chat | `aider` | смешно, помни се |
| Cline | 1 | игра на думи | CLI + line | cline.bot | `cline` | една сричка, звучи като CLI |
| Roo Code | 1+1 | име + дума | кенгуру | roocode.com | — | кратко + „code“ в домейна |
| Amp | 1 | дума | усилвател | ampcode.com | `amp` | 3 букви, домейнът е с „code“ |
| Jules | 1 | име | Жул, колега | jules.google | „ask Jules“ | човешко име |
| Factory / Droids | 3 / 1 | думи | фабрика, роботи | factory.ai | `droid` | продуктът е фабрика, агентите са „дроиди“ |
| Replit Agent | 2 | измислена | repl + it | replit.com | — | от термин на програмистите |
| Kiro | 2 | измислена/име | — | kiro.dev | `kiro` | кратко, неутрално, .dev |
| Warp | 1 | дума | скорост, „warp drive“ | warp.dev | `warp` | една сричка, .dev |
| Zed | 1 | буква | последната буква | zed.dev | `zed` | 3 букви |
| OpenHands | 2 | съставна | „отворени ръце“ | all-hands.dev | — | метафора за помощ |
| Goose | 1 | дума | гъска (Top Gun) | GitHub на Block | `goose` | смешно, една сричка |
| Augment | 2 | дума | „допълва“ човека | augmentcode.com | — | ролята в името + „code“ |
| Tabnine | 2 | съставна | Tab + 9 | tabnine.com | — | клавишът, който ползваш |
| OpenCode | 3 | съставна | отворен код | opencode.ai | `opencode` | описателно |
| Continue | 3 | дума | „продължи“ | continue.dev | — | действие |
| Conductor | 3 | дума | диригент на агенти | conductor.build | — | ролята в името |
| Lovable / Bolt / v0 | 3 / 1 / 2 | думи | чувство, мълния, версия 0 | lovable.dev, bolt.new, v0.app | — | кратко, необичайни TLD |
| Vercel | 2 | измислена | „versatile“ + „cell“ | vercel.com | `vercel` | измислена, но звучи истинско |
| Linear | 3 | дума | линейно, подредено | linear.app | — | обикновена дума + .app |
| Raycast | 2 | съставна | лъч + хвърляне | raycast.com | — | две къси думи = уникално |
| Supabase | 3 | съставна | super + base | supabase.com | `supabase` | съставна, уникална |
| Bun / Deno | 1 / 2 | дума / анаграма | кифла / Node обърнато | bun.sh, deno.com | `bun`, `deno` | кратко, .sh |
| Railway | 2 | дума | железница | railway.com | `railway` | метафора за път |
| Vapi | 2 | измислена | voice API | vapi.ai | — | гласова платформа, .ai |

### Моделите на именуване
- **Дължина.** 1–2 срички почти навсякъде (Amp, Warp, Zed, Bun, Cline, Jules; Cursor, Codex, Devin, Kiro).
- **Три типа име:**
  1. обикновена дума с метафора (Cursor, Warp, Railway, Linear, Copilot, Conductor);
  2. човешко име за агент, с когото „говориш“ (Devin, Jules, Kiro): „ask Devin“;
  3. измислена или съставна дума за платформа (Vercel, Supabase, Raycast, Tabnine).
- **Ролята често е в името:** Copilot (не пилот), Augment, Aider, Conductor.
- **Домейни.** Почти никой нов продукт няма голия .com. Обичайното е:
  - .dev, .sh, .ai, .app (kiro.dev, warp.dev, bun.sh, opencode.ai);
  - или дума + „code“ (ampcode.com, roocode.com, augmentcode.com);
  - или необичаен TLD (aider.chat, cline.bot, bolt.new).
- **CLI.** Името е командата: `amp`, `codex`, `kiro`, `goose`. Една-две срички, без тире.
- **Глас.** Името на агента е и името, на което говориш: „Copilot, …“, „ask Devin“, „hey Jules“.

## 2. Кандидати (45)

Посоки: харнес и въжета (конската амуниция), водене без волан (лоцман, пит-стена, осигуряване в катеренето), проверка,
измислени думи. **Ф** = финалист.

**Харнес и въжета**
1. Tack — общото име на конската амуниция (юзди, седло, хамут). **Ф**
2. Tackline — tack + line (въжето, с което водиш); в морето е въжето между сигналните флагове. **Ф**
3. Yoke — хамутът, който впряга двама вола да теглят заедно. **Ф**
4. Reins — юздите. Отпада: Reins е Python рамка „агентът предлага, човекът решава“ и има Rein Security.
5. Bridle — оглавник. Отпада: два „Claude Code harness manager“-а с това име (tacoda/bridle, neiii/bridle).
6. Halter — оглавник за водене. Отпада: „halt“ = спри.
7. Hitch — впрягам. Отпада: всички домейни са заети, а „hitch“ е и „засечка“.
8. Cinch — коланът на седлото; „it's a cinch“ = лесно. Отпада: домейните са заети.
9. Tether — каишка. Отпада: Tether е криптовалута.
10. Leash — каишка. Отпада: звучи като „на каишка“ за човека.
11. Harnyx — измислена от harness. **Ф**
12. Ostler — конярят в хана, който впряга конете. **Ф**

**Водене без волан**
13. Pitwall — пит-стената във F1: инженерите четат телеметрията и говорят на пилота по радиото, но кара пилотът. **Ф**
14. Belay — осигуряването в катеренето: въжето и човекът долу пазят катерача, но катери той. **Ф**
15. Marshal — регулировчикът на пистата, който вкарва самолета на място; и „marshal“ в програмирането. **Ф**
16. Gantry — кулата до ракетата: държи я, проверява я и я пуска при „go“. **Ф**
17. Spotter — наблюдателят по радиото в NASCAR. Отпада: Spotter/SpotterCode на ThoughtSpot.
18. Cairn — каменна пирамида, която маркира пътеката. Отпада: поне 7 AI проекта за код с това име.
19. Takt — тактът на диригента. Отпада: два оркестратора на кодови агенти (nrslib/takt, oscarrenalias/takt).
20. Heed — внимавам. Отпада: heed е macOS приложение за кодови агенти.
21. Helm — кормилото. Отпада: Helm на Kubernetes.
22. Keel — килът. Отпада: Keel.sh за Kubernetes.
23. Keelson — вътрешният кил. Отпада: френска марка KEELSON, клас 9/42 (2026).
24. Tiller — румпелът. Отпада: Tiller е финансово приложение.
25. Bosun — боцманът. Отпада: изписването е трудно (boatswain).
26. Cox — рулевият в гребането. Отпада: грубо значение на жаргон.
27. Docent — екскурзоводът в музея. Отпада: домейните са заети, а смисълът е само „обяснява“.
28. Usher — разпоредителят. Отпада: певецът Usher.
29. Towline — въжето за теглене. Отпада: американска марка TOWLINE в клас 42.
30. Holdfast — „държи здраво“. Отпада: всички домейни са заети.
31. Sherpa — Sherpa.ai вече е AI марка [НП].
32. Mentor — общо слово.

**Проверка**
33. Plumb / Plumbline — отвесът, проверява правото. Отпада: всички домейни и npm са заети.
34. Assay — проба на метал. Отпада: заети домейни; трудно произношение.
35. Vouch — гарантирам. Отпада: Vouch proxy и Vouch застраховки [НП].
36. Docket — делата, които чакат съдията. Отпада: Docket (YC P25) прави AI агенти за QA тестове.
37. Verdict — присъда. Отпада: всички домейни са заети; гласът не дава присъдата.
38. Verdi — присъда + диригент. Отпада: композиторът задръства SEO.
39. Gavel — чукчето е на човека, не на харнеса.
40. Proofline — всички домейни са заети.

**Човешки имена (като Devin/Jules)**
41. Tess — „test“. Отпада: Tessl е „management layer for coding agents“.
42. Vera — „vera“ = истина. Отпада: Veracode (сигурност на кода) и Vera AI.
43. Otto — автопилотът. Отпада: значи точно обратното (той управлява).

**Сегашното име**
44. Mandat — оставаме с него. **Ф**
45. Mandate — английският вариант. Отпада: agentmandate (PyPI) и mandate.md са за правата на агентите; .dev и .ai са заети.

## 3. Критерии и тегла

| Критерий | Тегло | Защо такова |
|---|---|---|
| Звучи като продукт на пазара | 20 | Това е основната забележка на Симо. |
| Марки в клас 9/42 | 15 | Конфликт в клас 9 (софтуер) или 42 (SaaS) спира името. |
| SEO уникалност | 15 | През 2026 всяка къса „харнес“ дума вече е малък AI проект (§2); името трябва да излиза първо за „name + AI“. |
| Смисъл | 15 | Харнес, който води и проверява; гласът води, човекът одобрява. |
| Произношение на английски | 10 | Всеки програмист, на всеки език, без да пита как се казва. |
| CLI и дума за повикване | 10 | `name run` и „hey Name“: 1–2 срички, не се бърка с честа дума. |
| Домейни | 10 | Голият .com е невъзможен за кратки думи (§5); броят .dev, .sh, .ai или „name + code“.com. |
| npm и GitHub org | 5 | Нужни са, но scope (`@name/cli`) и org с наставка (`name-dev`) решават проблема. |

Оценка 1–5 на критерий. Обща оценка = Σ(оценка × тегло) / 5, от 0 до 100.

## 4. Таблица на финалистите

| Име | Пазар (20) | Марки (15) | SEO (15) | Смисъл (15) | Произн. (10) | CLI/глас (10) | Домейни (10) | npm/GH (5) | **Общо** |
|---|---|---|---|---|---|---|---|---|---|
| **Tackline** | 4 | 5 | 5 | 4 | 5 | 3 | 3 | 3 | **83** |
| **Harnyx** | 4 | 5 | 4 | 4 | 3 | 5 | 3 | 3 | **80** |
| **Pitwall** | 5 | 2 | 2 | 5 | 5 | 4 | 2 | 1 | **70** |
| Belay | 5 | 2 [НП] | 1 | 5 | 4 | 5 | 2 | 1 | **67** |
| Mandat | 3 | 2 | 2 | 5 | 4 | 4 | 4 | 3 | **66** |
| Tack | 4 | 3 [НП] | 1 | 4 | 5 | 5 | 2 | 1 | **65** |
| Marshal | 4 | 3 [НП] | 1 | 4 | 5 | 4 | 2 | 1 | **63** |
| Gantry | 4 | 1 | 2 | 4 | 5 | 4 | 2 | 1 | **60** |
| Ostler | 3 | 1 | 3 | 4 | 3 | 4 | 3 | 3 | **59** |
| Yoke | 4 | 2 | 1 | 4 | 3 | 5 | 2 | 1 | **58** |

### Защо тези оценки
- **Tackline.**
  - Смисъл: tack е амуницията на харнеса, line е въжето, с което водиш, без да яздиш вместо коня.
  - Марки: в TMview има само прекратени американски TACKLINE в 9/42 (1997) и нова заявка в клас 36 (финанси).
  - SEO: няма продукт с това име (търсенето връща само Tacklit, TackleAI); в GitHub има 9 малки репота.
  - Домейни: tackline.dev и tackline.sh са свободни (.com, .ai, .io и .app не са); npm `tackline` е свободен, GitHub
    org е зает.
  - Слабо: две срички, но 8 букви; командата може да е `tackline` с кратко `tack`.
- **Harnyx.**
  - Смисъл: на пръв поглед казва „harness“ и звучи като Vercel или Deno.
  - Марки: в TMview има само „LYHARNYX“ в клас 6 (метал).
  - Домейни: harnyx.dev и harnyx.sh са свободни; npm е свободен.
  - Слабо: „y“ обърква произношението (HAR-nix); има малък GitHub org harnyx/harnyx (6 звезди), който може да е активен.
- **Pitwall.**
  - Смисъл: най-силната метафора за гласа. Инженерът от пит-стената говори на пилота по радиото („box, box“), гледа
    телеметрията, но кара пилотът.
  - Марки: японска PITWALL в 9/42 (2023) и американска заявка „PITWALL ONE“ в клас 9 (5.11.2026).
  - SEO: 1157 репота, F1 съдържание, а quanticstudios/pitwall е „terminal multiplexer for coding agents“, т.е. същата ниша.
  - Домейни: свободни са само pitwallcode.com и pitwall.codes.
- **Belay.** Метафората е перфектна (осигурителят пази въжето, катерачът катери). Но в Product Hunt има Belay, който е
  „self-hosted verification harness“ с присъди от повторно изпълнение, т.е. почти същият продукт. Има и Belay Inc
  (виртуални асистенти) [НП за марката].
- **Mandat.** Смисълът е най-точен: човекът дава мандат, агентите работят в него. Но:
  - на английски се чете като сгрешено „mandate“, а Google за „mandat“ е френско и немско (политика, пощенски запис);
  - в TMview има 1592 записа; има регистрирана канадска MANDAT в клас 9 и румънска заявка в клас 9 (2026).
  - Плюсът: mandat.sh, mandat.run, mandat.codes, usemandat.com и mandatcode.com са свободни; npm scope `@mandat` е свободен.
- **Tack, Marshal, Yoke.** И трите звучат като продукт, но вече има харнеси за кодови агенти с тези имена (tack, MarshalFleet,
  yoke-harness/yoke-agent/upyoke). Yoke има и 5543 марки, вкл. американска YOKE в клас 9. На английски yoke звучи като yolk.
- **Gantry.** Има американска GANTRY в 9/42 (2021), британска заявка в 9/41/42 (2026) и стартъп Gantry (Series A).
- **Ostler.** Има заявка в EUIPO за OSTLER в 9/42 (25.10.2026) и британска в клас 9. Вероятно е на приложението
  „Ostler“ (личен AI на Mac).

## 5. Главната находка

През ноември 2026 всяка къса английска дума за харнес, въже или водене вече е:
- регистриран домейн (.com, .ai, .dev, .sh);
- npm пакет;
- GitHub org;
- и често малък AI проект за кодови агенти. 
Примери: Belay, Bridle, Cairn, Takt, Reins, Heed, Marshal, Yoke, Tack, Docket, Pitwall.

От 70+ проверени домейна свободни бяха само съставни или измислени имена, или имена с наставка („code“, „use“, „get“).
Затова на върха са съставното Tackline и измисленото Harnyx, а не единична дума.

## 6. Препоръка

### Топ 3
1. **Tackline (83)**
   - Силно: звучи като Linear или Railway; казва „харнес“ на всеки, който познава конете, и „водене“ на всички останали.
     Чисто е по марки и SEO. Има tackline.dev и свободен npm.
   - Слабо: 8 букви за CLI (решава се с `tack` като кратко); .com и .ai са заети; GitHub org трябва с наставка
     (`tackline-dev`).
   - Глас: „Hey Tackline, what's waiting for me?“ звучи добре.
2. **Harnyx (80)**
   - Силно: никой няма да пита какво прави, защото е „harness“. Отличава се като дума за повикване. Чисто е по марки.
     Има harnyx.dev, harnyx.sh и свободен npm.
   - Слабо: измислена дума с „y“; хората ще я казват различно (HAR-nix / har-NIX); съществува малкият org harnyx/harnyx.
3. **Pitwall (70)**
   - Силно: най-силната история за гласа: „аз съм пит-стената, ти караш“. Звучи като истински продукт.
   - Слабо: японска марка в 9/42, американска заявка в клас 9, малък проект за кодови агенти със същото име; голите
     домейни са заети.

### Смело име: Belay
Най-точната метафора за харнес с проверка и човек, който решава. Смело, защото има почти същия продукт в Product Hunt; ще
трябва да го надминем в SEO и да проверим марката на Belay Inc.

### Безопасно име: Mandat
Без преименуване; кодът, CLI (`pnpm mandat …`), документацията и демото остават. Свободни са mandat.sh, mandat.run и
`@mandat` в npm. Цената: на английски звучи като сгрешено „mandate“ и SEO е задръстено.

### Става ли за целия продукт
Да, и препоръката е **едно име за продукта, CLI и гласа**. Така правят и Copilot, Devin, Amp и Kiro: продуктът е името, на
което говориш.
- Tackline: `tackline run`, „Hey Tackline“, „Tackline verdict: VERIFIED“. Става.
- Harnyx: `harnyx run`, „Hey Harnyx“. Става.
- Pitwall: `pitwall run` и „Pitwall, what's waiting?“ звучат естествено; за продукта е малко по-тясно (F1).
- Ако името на продукта остане Mandat, гласът може да е отделно име (напр. Tackline или Pitwall), но тогава са две марки.

### Преди решението
1. Кажи „Hey Tackline“ / „Hey Harnyx“ / „Hey Pitwall“ през гласа на ElevenLabs (английски и български акцент) и чуй
   разпознаването.
2. Провери марките директно в USPTO, EUIPO и WIPO Global Brand Database (TMview не е официален регистър).
3. Провери хендълите в X, YouTube, Discord и Product Hunt [НП].

## 7. Проверено и непроверено

Проверено на 21.11.2026:
- **Домейни:** проверка на наличност в регистъра през Vercel (`get_bulk_availability`). Около 200 домейна за .com, .ai, .dev,
  .sh, .io, .app, .run, .so, .codes и варианти code/use/get/hey. Само четене; нищо не е запазено.
- **npm:** `https://registry.npmjs.org/<name>` (200 = зает, 404 = свободен) и `https://registry.npmjs.org/-/org/<name>/package`
  за scope.
- **GitHub org/потребител:** `https://api.github.com/users/<name>` (200 = зает). Търсене на репота през
  `https://api.github.com/search/repositories?q=<name>+in:name`.
- **Марки:** TMview на EUIPO, търсене по точно име:
  - https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=tackline
  - https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=harnyx
  - https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=pitwall
  - https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=gantry
  - https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=ostler
  - https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=mandat
  - https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=keelson
  - https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=towline
  - https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=yoke
- **Продукти със същото име:**
  - Belay harness: https://www.producthunt.com/p/belay/belay
  - Bridle: https://github.com/tacoda/bridle, https://dev.to/tacoda/introducing-bridle-a-claude-code-harness-manager-1e4k
  - Cairn: https://github.com/cairn-dev/cairn, https://github.com/euxaristia/cairn-code
  - Takt: https://github.com/nrslib/takt/wiki, https://github.com/oscarrenalias/takt
  - Reins / Rein Security: https://github.com/thehotpath/reins, https://thenextweb.com/news/rein-security-ai-agent-visibility-control-kill-switch
  - heed: https://raw.githubusercontent.com/heed-build/heed/HEAD/README.md
  - SpotterCode: https://www.thoughtspot.com/blog/spottercode-in-developer-playground
  - MarshalFleet: https://pypi.org/project/MarshalFleet/
  - Docket (YC): https://ycombinator.com/companies/docket
  - Yoke: https://pypi.org/project/yoke-harness/, https://pypi.org/project/yoke-agent/
  - tack: https://github.com/Likhith-Sanathi/tack, https://pypi.org/project/tack-agent
  - Pitwall: https://www.libhunt.com/posts/1545976-i-made-pitwall-a-terminal-multiplexer-for-coding-agents
  - Gantry: https://www.southparkcommons.com/companies/gantry
  - Ostler: https://os001-public-website.pages.dev/why-ostler.html
  - Mandate: https://pypi.org/project/agentmandate/
  - Tessl: https://tessl.io/agent
  - Halyard: https://pypi.org/project/halyard/
  - Roo Code спрял на 15.05.2026 (един източник): https://resources.rework.com/tools/ai-agents/best-ai-coding-agents-2026
- **Tackline:** търсенето в мрежата не намери продукт с това име.

[НП] Непроверено:
- Метафорите и бележките в пазарната таблица (по памет); домейните ѝ са проверени като заети.
- Обем на търсене в Google (няма Keyword Planner/Ahrefs); SEO е по това какво излиза в резултатите, търсене от САЩ.
- Марки извън TMview и марките на Belay Inc, Sherpa.ai, Vouch, Tack, Marshal.
- Хендъли в X, YouTube, Discord, Product Hunt.
- Как ElevenLabs разпознава „Hey Tackline/Harnyx/Pitwall“.
