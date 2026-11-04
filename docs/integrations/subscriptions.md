# Абонаменти: кои ИИ се ползват със собствен вход (D-460–D-463)

Всичко е прочетено на **04.11.2026**. Версиите, датите и лицензите са от `https://registry.npmjs.org/<пакет>` същия ден.
`[НП]` = непроверено (или само вторичен източник).

Как работи абонаментът в Мандат (D-295): **непромененият** CLI на доставчика влиза веднъж през собствения поток на
доставчика; входът стои във volume `mandat-profile-<доставчик>-<име>`, монтиран само в контейнера на агента; харнесът не
го чете, пуска само командата за статус („влязъл ли е“, имейл, план). Навън агентът излиза само през CONNECT тунелите на
вратата към хостовете на доставчика.

Регистърът е един: `packages/contract/src/subscriptions.ts` (`SUBSCRIPTIONS`). Нов доставчик = един запис там (CLI,
начин на вход, команди, папка и променлива за входа, тунели, условия, наличност). Пясъчникът (`buildProfileArgs`,
монтирането), каналите (тунелите), CLI-ят (`mandat login --agent`, списъкът с акаунти) и уебът (Настройки → Абонаменти,
полето за задача, Настройки → Модели) четат само него.

Два вида „абонамент“ има на пазара:
- **(А) Вход** — OAuth / код за устройство, пазен от CLI-я в неговата папка. Това е мястото на този документ (D-295).
- **(Б) Ключ** — „coding plan“, който всъщност е специален API ключ (Z.ai GLM, Alibaba/Qwen Coding Plan, MiniMax M Plan,
  платформеният ключ на Kimi). Те вече вървят през проксито (Настройки → Ключове/Модели, D-392): ключът е само в
  llm-proxy и не иска изключението на D-295.

## Таблица

| Доставчик | Абонамент | Headless | Вход | В контейнер без браузър | Къде е входът | Статус | Условия за харнес | Пакет · лиценз · дата | В Мандат |
|---|---|---|---|---|---|---|---|---|---|
| Claude Code | Pro / Max / Team / Enterprise | `claude -p --output-format stream-json` | браузър + **поставяш код** | да | `CLAUDE_CONFIG_DIR` → `.credentials.json` | `claude auth status --json` | **позволено** за непроменения CLI с входа на човека, вкл. хостван; без пипане на токена, без препродажба | @anthropic-ai/claude-code 2.1.318 · собственически · 03.11.2026 | **работи** (ready) |
| OpenAI Codex | ChatGPT Plus / Pro / Business / Edu / Enterprise | `codex exec --json` | **код за устройство** `codex login --device-auth` (първо се включва в настройките за сигурност на ChatGPT) | да | `CODEX_HOME` → `auth.json` | `codex login status` | позволено; за CI препоръчват ключ, ChatGPT входът е „advanced“ | @openai/codex 0.166.0 · Apache-2.0 · 29.10.2026 (в образа 0.160.1) | свързан, **[НП] жив вход** (untested) |
| Gemini CLI | само Code Assist Standard / Enterprise (личните планове са преместени в Antigravity на 18.06.2026) | `gemini -p --output-format stream-json` | браузър; `NO_BROWSER=true` → поставяш код | да | `GEMINI_CLI_HOME` → `.gemini/oauth_creds.json` | [НП] | OAuth на Code Assist през софтуер на трети страни е нарушение; непромененият CLI в обвивка не е споменат | @google/gemini-cli 0.67.0 · Apache-2.0 · 04.11.2026 (в образа 0.65.0) | **спрян** (Q-073, Q-090) |
| Antigravity CLI (`agy`) | Google free / AI Pro / Ultra | `agy -p --output-format stream-json` | поставяш код само под pty; няма подкоманда за вход/статус | частично (файл без D-Bus) | `$HOME/.gemini/antigravity-cli/` | `agy models` (изход 1 = не влязъл) | **забранено**: antigravity.google/terms §6 (софтуер на трети страни за достъп) | agy 1.5.0 · собственически · storage.googleapis.com | **blocked** (D-465) |
| GitHub Copilot CLI | Copilot Free / Pro / Pro+ / Business / Enterprise | `copilot -p --output-format json --allow-all-tools …` | **код за устройство** `copilot login --device-code` | да, ако `settings.json` има `storeTokenPlaintext` (семе преди входа) | `COPILOT_HOME` → `config.json` | JSON-RPC `auth.getStatus` (проба `mandat-copilot-status`) | позволено (programmatic mode за скриптове) | @github/copilot-linux-* 1.0.105 · GitHub Copilot CLI License · 28.10.2026 | **untested** (D-464) |
| Kimi Code | членство Kimi Code | `kimi -p --output-format stream-json` (без флаг за одобрение — `-p` е „auto“) | **код за устройство** `kimi login --region global` | да (само файл) | `KIMI_CODE_HOME` → `credentials/`, `config.toml` | `kimi provider list --json` съдържа `managed:kimi-code` | **неясно**: „само лично интерактивно ползване“ | @moonshot-ai/kimi-code 2.4.1 · MIT · 30.10.2026 | **untested** (D-464), предупреждение в UI |
| Cursor CLI (`agent`) | Pro / Pro+ / Ultra / Teams | `agent -p --output-format stream-json --force --trust` | **линк** `agent login` (опашка към api2.cursor.sh, без код) | да | `XDG_CONFIG_HOME` → `cursor/auth.json` | `agent status --format json` (`isAuthenticated`) | позволено (headless за скриптове) | 2026.10.22-27dcf5f · собственически · downloads.cursor.com | **untested** (D-464); тунелът за агента [НП] |
| MiniMax Code (`mcode`) | M Plan | `mcode exec --output-format stream-json --permission full` | **код за устройство** `mcode login --region global --no-browser` | да (само файл) | `MINIMAX_DATA_DIR` → `auth/prod/en/…` | `mcode login` казва „Already signed in“ [НП: офлайн] | **неясно**: M Plan е „individual, interactive use“ | @minimax-ai/code 0.7.4 · MIT (+MPL-2.0 зависимост) · 30.10.2026 | **untested** (D-464), предупреждение в UI; данните за обучение — изключени със семе `config.yaml` |
| Qwen Code | ~~Qwen OAuth~~ (спрян на 15.04.2026); ModelStudio Coding Plan = ключ | `qwen -p` | ключ `sk-sp-…` | — (вид Б) | `~/.qwen/settings.json` | — | [НП] | @qwen-code/qwen-code 0.26.7 · Apache-2.0 · 04.11.2026 | не е абонамент → Ключове |
| Z.ai GLM Coding Plan | ключ | през Claude Code с base URL | ключ | — (вид Б) | — | — | само в „официално поддържани инструменти“ (Claude Code е сред тях) | @z_ai/coding-helper 0.1.1 · без лиценз | вече е в Ключове (`zai`) |
| DeepSeek | няма абонамент, само API | — | — | — | — | — | — | — | вече е в Ключове (`deepseek`) |
| iFlow CLI | спрян на 17.04.2026 [НП, вторичен източник] | — | — | — | — | — | — | @iflow-ai/iflow-cli 0.5.19 | не |
| Amp | собствени кредити; партньор „Use your ChatGPT plan“ | `amp -x --stream-json` | `amp login`; `AMP_API_KEY` [НП] | чрез ключ [НП] | [НП] | [НП] | собствен продукт | @sourcegraph/amp · собственически · 04.11.2026 | не (харнес на трети страни) |
| OpenCode | ChatGPT, Copilot, GitLab Duo, Zen/Go (без Claude от 1.3.0) | `opencode run --format json` | браузър; Copilot с код | частично | `~/.local/share/opencode/auth.json` | `opencode auth list` | харнес на трети страни: ChatGPT да, Claude забранено | opencode-ai 1.19.5 · MIT · 28.10.2026 | не (не е CLI на доставчика) |
| Grok (xAI) | SuperGrok; официален CLI [НП] | — | — | — | — | — | — | само общностни (`@vibe-kit/grok-cli` 0.0.34, MIT, иска API ключ) | не |
| Factory Droid, Augment Auggie, Kiro CLI, Kilo, Crush, Pi | собствени планове | вж. източниците | различно | различно | [НП] | [НП] | собствени продукти / харнеси на трети страни | вж. по-долу | не |

Наличност в Мандат (поле `availability` в регистъра): **ready** = пробван на живо; **untested** = свързан докрай, без
жив вход; **blocked** = свързан, условията не са ясни/против; **planned** = CLI-ят не е в образа или няма адаптер.

## Източници (прочетени 04.11.2026)

- Claude Code: https://code.claude.com/docs/en/authentication · https://code.claude.com/docs/en/cli-reference ·
  https://code.claude.com/docs/en/network-config · условия: https://code.claude.com/docs/en/legal-and-compliance ·
  OpenCode маха Claude входа в 1.3.0: https://opencode.ai/docs/providers/
- Codex: https://learn.chatgpt.com/docs/auth · https://learn.chatgpt.com/docs/non-interactive-mode ·
  програмата „Sign in with ChatGPT“: https://learn.chatgpt.com/docs/sign-in-with-chatgpt · https://registry.npmjs.org/@openai/codex
- Gemini CLI: https://github.com/google-gemini/gemini-cli/blob/main/README.md ·
  https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ ·
  https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/authentication.mdx ·
  https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md ·
  https://github.com/google-gemini/gemini-cli/blob/main/docs/resources/tos-privacy.md
- Antigravity: https://antigravity.google/docs/cli/reference · https://antigravity.google/docs/install ·
  https://discuss.ai.google.dev/t/is-external-orchestration-of-antigravity-cli-headless-mode-supported-with-account-based-usage/183051 ·
  https://github.com/google-antigravity/antigravity-cli/issues/318
- Copilot CLI: https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli ·
  https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically · https://registry.npmjs.org/@github/copilot
- Cursor: https://cursor.com/docs/cli/headless · https://cursor.com/docs/cli/reference/authentication ·
  https://forum.cursor.com/t/cli-2026-09-28-login-stores-a-token-the-next-command-rejects-and-headless-runs-hang-on-the-browser-use-plugin/173376
- Qwen Code: https://github.com/QwenLM/qwen-code/blob/main/docs/users/configuration/auth.md · https://registry.npmjs.org/@qwen-code/qwen-code
- Kimi Code: https://moonshotai.github.io/kimi-code/en/reference/kimi-command ·
  https://moonshotai.github.io/kimi-code/en/guides/getting-started · https://registry.npmjs.org/@moonshot-ai/kimi-code
- Z.ai: https://docs.z.ai/devpack/quick-start
- MiniMax: https://agent.minimax.io/docs/cli/quick-start.md · https://platform.minimax.io/docs/coding-plan/intro
- DeepSeek (няма план): https://qcode.cc/de/deepseek-code-plan [вторичен]
- iFlow: https://github.com/router-for-me/CLIProxyAPI/issues/2561 [вторичен]
- Amp: https://ampcode.com/docs/cli/streaming-json · OpenCode: https://opencode.ai/docs/cli/
- Grok: https://kingy.ai/?p=15621 [вторичен]
- Други: https://docs.factory.com/cli/getting-started/quickstart · https://docs.augmentcode.com/cli/automation ·
  https://kilo.ai/docs/cli · https://dev.classmethod.jp/ja/articles/kiro-cli-2-0-headless-mode-api-key-auth/

## Спайкове за планираните (какво трябва, за да станат „ready“)

Общо за всеки: CLI-ят в `docker/sandbox/Dockerfile` по правило 8 (точна версия, ≥ 3 дни, integrity, лиценз в
`license-allowlist.json`, ред в `docs/dependencies.md`); адаптер в `packages/agents/src/<cli>` (argv за headless,
превод на потока към `agent-stream`, фикстури); `tokenName`/среда за фазата agent в `envForPhase`; в регистъра —
`login.argv`, `status`, `logout`, `tunnels`, `agent`, `connectionProvider` (каталог с модели в `connections.ts`); Docker
тест с истинския CLI и фалшив endpoint; жив вход от Симо.

1. **GitHub Copilot CLI** (най-ясният): `copilot login --device-code` → код на https://github.com/login/device; изход
   `--output-format json`. Отворено: дали `COPILOT_HOME` без keychain пише входа във файл без въпрос (интерактивно
   предлага „save plaintext?“) — спайк в контейнер; хостът на моделите (`api.githubcopilot.com` [НП]); собственически
   лиценз — трябва ред в allowlist (като Claude Code).
2. **Kimi Code**: `kimi login` (код за устройство, печата URL и код в stderr); пакетът е от днес — чака ≥ 3 дни;
   условията [НП].
3. **Antigravity**: keyring вместо файл — вероятно не става с volume; условията противоречиви → чака Q-090.
4. **Cursor, MiniMax Code**: входът и мястото му са [НП]; първо спайк дали входът завършва без localhost.
