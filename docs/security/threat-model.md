# Модел на заплахите (STRIDE) — Мандат v5

Статус: чернова от E8з (22.10.2026); **чака преглед от Симо** (чеклист, ред 23).
Обхват: всичко, което работи на машината на човека или в неговия Supabase проект. Извън обхват: компрометиран
хост/ядро/Docker демон, компрометиран акаунт на доставчика на модела, физически достъп.

## Активи
| Актив | Къде живее | Кой не бива да го вижда |
| --- | --- | --- |
| API ключ на доставчика | само в llm-proxy (заключен старт, D-345) | агентът, логовете, web |
| `mdt_` токен | пясъчникът на агента, проксито | логове, дневник, web |
| Изходният код и тайните на човека | работното копие, огледалото | доставчика извън задачата, чужди хостове |
| Присъдата и дневникът | `.mandat/runs/*`, `ledger` (append-only, хеш верига) | никой не пише след факта |
| Контролният слой (харнес профил, hooks, settings) | read-only mount в пясъчника (D-343, D-350) | агентът (запис) |
| Сесия/роли в web | Supabase Auth, `members.role_id` (D-349) | друга организация, viewer за опасни действия |

## Граници на доверие
1. **Агент ↔ пясъчник** — агентът (и всичко, което той чете: задача, issue, README, MCP описания) е недоверен.
2. **Пясъчник ↔ мрежа** — единственият изход е egress-gate (HTTP маршрути, DNS, CONNECT само към точен host:port при абонамент, D-294).
3. **Пясъчник ↔ хост** — само износ (`packages/export`) на дърво, никога `.git`, symlink или hardlink.
4. **Worker ↔ база** — service role само в worker (тестът `service-role-scope`); web е с ролята на човека и RLS.
5. **Външен текст ↔ UI/LLM** — всичко външно минава през `frameUntrusted()` и редакцията.

## STRIDE по компонент
Легенда: S подправяне на самоличност · T промяна · R отричане · I изтичане · D отказ на услуга · E издигане на права.
„Тест“ е файл, който падa, ако контролът изчезне; „пропуск“ значи, че такъв тест още няма.

### 1. Пясъчник на агента
| # | STRIDE | Заплаха | Контрол | Тест |
| --- | --- | --- | --- | --- |
| P1 | E | бягство към хоста през привилегии | `SANDBOX_HARDENING`: `--cap-drop=ALL`, `no-new-privileges`, `--read-only`, без docker.sock/publish/`--privileged` (правило 7) | `packages/sandbox/src/sandbox.test.ts`, `apps/worker/src/sandbox.docker.test.ts` |
| P2 | T | агентът пренаписва контролния слой (hooks, settings, политика) | read-only mount, извън дървото | R17 (`EACCES` при запис), `control-layer.docker.test.ts` |
| P3 | T | агентът сменя `.claude/**`, `.mcp.json`, CI, `.mandat.yml` в дървото | D3 protected_paths → UNKNOWN („човек решава“) | R17, bench B10, B17, B18, B20 |
| P4 | I | ключът виждан отвътре | само `mdt_` токен; ключът е в проксито | R8 (b) |
| P5 | I | canary/тайна стига диска или износа | редакция на потока, canary скенер | R8 (a), `packages/redaction/src/redactor.test.ts` |
| P6 | T | symlink/hardlink/`.git` излиза през износа | `pack-tree` отказва, `clean-git` | R5, `packages/export/src/pack-tree.test.ts`, `clean-git.test.ts` |
| P7 | T | подмяна на diff след VERIFY | integrity хеш на diff (D-074) | R6 |
| P8 | E | prompt injection в текста на задачата разширява обхвата | `allowed_paths` идват от договора, не от агента; hooks отказват команди; D4 out_of_contract | R15 |
| P9 | D | fork бомба, памет, диск | `--pids-limit=512`, `--memory=2g`, tmpfs с размер, таймаут | `sandbox.docker.test.ts` (лимити); диск: **пропуск** (няма тест за пълен tmpfs) |
| P10 | T | „зелено“ чрез специален случай за тестовите входове | D11 special_case + мутации (D-300, D-357) | bench B9 |
| P11 | T | отслабен тест с еднакъв брой `expect` | **известна граница** (D-357): D2 не я вижда; в демото я хваща само D4 (`may_change_tests: false`) | bench B16 (FAILED само по D4) |

### 2. Egress-gate
| # | STRIDE | Заплаха | Контрол | Тест |
| --- | --- | --- | --- | --- |
| G1 | I | изтичане по HTTP към произволен хост | точни маршрути; без нормализация; `..`, `//`, `%2e`, `%2f` → bad_path (D-100); scoped packument — само точният `%2f` (D-354) | `gate.test.ts`, R14 |
| G2 | I | DNS exfil (`<base32>.evil.example`) | вратата е единственият резолвер; непознато име → `dns_block`, без ANSWER | R19, R14 |
| G3 | I | CONNECT тунел до произволен хост | само точен host:port от `tunnels`, само във фаза agent (D-294) | R20, `gate.test.ts` |
| G4 | T | lockfile с `resolved` към чужд registry | D10 lock_foreign + маршрутът не съществува → 403 | R18, bench B11 (lock_missing) |
| G5 | D | MCP sidecar изчерпва бюджета | upstream `mcp` с per_min бюджет | `gate.test.ts`; натоварване: **пропуск** |
| G6 | R | „не съм го направил“ | всеки отказ е ред в gate log (`proxy_block`, `dns_block`), той е в доказателствата | R18–R20 четат лога |

### 3. LLM proxy
| # | STRIDE | Заплаха | Контрол | Тест |
| --- | --- | --- | --- | --- |
| L1 | S | друг процес се представя за агента | `mdt_` токен на прогон; заключен старт с еднократен boot токен (D-345) | `proxy-boot-token.test.ts`, `proxy.test.ts` |
| L2 | I | ключът в лог/отговор | правило 5; тела на заявки не се логват | `proxy.test.ts`, `envelope.test.ts` |
| L3 | D/финанси | разход над бюджета | бюджет на прогон, отказ при таван | `state.test.ts` |
| L4 | I | при абонамент харнесът чете входа на CLI | D-295: харнесът не чете volume-а на профила | `profile-auth.test.ts` |

### 4. Worker (оркестратор, daemon)
| # | STRIDE | Заплаха | Контрол | Тест |
| --- | --- | --- | --- | --- |
| W1 | T | две задачи пишат един файл | конфликт по файл, WIP лимит, rebase преди доставка (D-355) | `conflict-wait.docker.test.ts`, `rebase.docker.test.ts`, `coordination.test.ts` |
| W2 | E | агентът одобрява собствения си „ask“ | решение само от човек в web (`decideAsk`), TOTP за опасни отваряния (D-352) | `ask-flow.docker.test.ts`, `permissions.test.ts`, `tool_permissions.test.sql` |
| W3 | T | отровен/подменен MCP сървър | точни версии, vetting без мрежа, хеш на дефинициите, блок при промяна (D-354) | R16, `vet.test.ts`, `mcp-sidecar.docker.test.ts` |
| W4 | I | външен текст (issue, CI лог, ревю) влиза в UI/LLM суров | `frameUntrusted()`, редакция; ревю коментари само по избор на човек (D-356) | `apply-comments.test.ts`, `ci.test.ts` |
| W5 | T | git операция унищожава работата на човека | `apply` само `merge --ff-only`; никога reset/checkout -f | `deliver-local.test.ts`, `apply-local` тестове в cli |
| W6 | D | задача виси вечно в HELD | срок `held_until` → expired (D-352) | `held-expiry.test.ts` |

### 5. Web (Next.js)
| # | STRIDE | Заплаха | Контрол | Тест |
| --- | --- | --- | --- | --- |
| A1 | E | viewer прави опасно действие | `has_cap` с обхват (D-349), guard на всеки route | `guard.test.ts`, `roles.test.ts`, `api.test.ts` |
| A2 | S | одобрение на профил без втори фактор | TOTP (D-351) | `totp.test.ts`, `profile-approve.test.ts` |
| A3 | I | service role или тайна в клиентския бъндъл | service role само в worker; sentinel скенер на бъндъла | `service-role-scope.test.ts`, `sentinel-scan.test.ts`, `channels-no-secrets.test.ts` |
| A4 | T | XSS от външен текст (diff, PR, MCP описание) | React escaping; без `dangerouslySetInnerHTML` за външен текст | **пропуск**: няма lint правило/тест; предложение в Q-057 |
| A5 | I | демо данни в продукция | `sample-off-in-prod` | `sample-off-in-prod.test.ts` |

### 6. База (Supabase/Postgres)
| # | STRIDE | Заплаха | Контрол | Тест |
| --- | --- | --- | --- | --- |
| B1 | I | друга организация чете редове | RLS на всяка таблица | `rls_matrix.test.sql`, `rls_roles.test.sql`, `web_rls.test.sql`, `workbench_rls.test.sql` |
| B2 | R/T | дневникът е пренаписан | append-only + хеш верига; котва | `ledger_append.test.sql`, `packages/ledger/src/ledger.test.ts`, `anchor.test.ts` |
| B3 | E | опасно отваряне на правата без TOTP | `private.layer_c_version` проверява TOTP в базата | `tool_permissions.test.sql` |
| B4 | I | API ключ в таблица в явен вид | ключовете — криптирани, четени само от worker | `api_keys.test.sql`, `keys.test.ts` |

### 7. MCP sidecar
| # | STRIDE | Заплаха | Контрол | Тест |
| --- | --- | --- | --- | --- |
| M1 | E | sidecar вижда тайни на агента или обратно | отделен контейнер, роля `mcp`, същото втвърдяване | `mcp-role.test.ts`, `mcp-sidecar.docker.test.ts` |
| M2 | T | описание на инструмент с инструкция (tool poisoning) | vetting: invisible/инструкции → блок | R16 (poisoned), `vet.test.ts` |
| M3 | T | „rug pull“: дефинициите се сменят след одобрение | `tools_hash` в профила; промяна → блок при старт | R16 (changed) |
| M4 | I | sidecar изнася данни | мрежата му е само през вратата, `egress_hosts` от каталога | `mcp-sidecar.docker.test.ts` |

### 8. Десктоп (Electron)
| # | STRIDE | Заплаха | Контрол | Тест |
| --- | --- | --- | --- | --- |
| D1 | E | отдалечено съдържание получава Node | `contextIsolation`, `nodeIntegration: false`, `sandbox: true` | **пропуск**: константата не е тествана |
| D2 | S | навигация към чужд URL / нов прозорец | `will-navigate` само към базовия адрес; `setWindowOpenHandler` → deny | `banner.test.ts` (`allowedUrl`) |
| D3 | I | паролата от банера записана на диск | държи се само в паметта | `banner.test.ts` (парсване); запис: **пропуск** |
| D4 | T | неподписан инсталатор | в облака — само неподписан пакет; подписване при Симо | ръчно (чеклист) |

## Червен отбор → заплаха
| Атака | Заплахи |
| --- | --- |
| R5 | P6 |
| R6 | P7 |
| R8 | P4, P5 |
| R14 | G1, G2 |
| R15 | P8 |
| R16 | M2, M3, W3 |
| R17 | P2, P3 |
| R18 | G4 |
| R19 | G2 |
| R20 | G3 |

## Пропуски (за решение)
- P9 диск, G5 натоварване, A4 XSS, D1 и D3 — без автоматичен тест. Предложение: lint правило срещу `dangerouslySetInnerHTML`
  и unit тест на `SECURE` в десктопа (евтино); диск/натоварване — в E10 (Q-057).
- P11 — известна граница на D2/D11: отслабен assertion без промяна на броя `expect`. Мутациите го хващат само ако мутантът оцелее.
