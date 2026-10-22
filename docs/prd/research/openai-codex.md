# OpenAI Codex — official configuration & harness mechanisms (research notes)

Compiled 2026-10-22. Audience: PRD authors.

## 0. Sourcing and verification status (read this first)

Access conditions in this session (2026-10-22):
- Direct HTTPS to `developers.openai.com`, `platform.openai.com`, `openai.com`, `help.openai.com` and `github.com` (HTML + REST API) was **refused by the session's egress proxy (HTTP 403 on CONNECT)**. `WebFetch` returned `ENOTFOUND` for `developers.openai.com`.
- Anonymous `git clone` of the public repo **https://github.com/openai/codex** succeeded. Everything marked **[REPO]** below is read directly from the source at commit `c260087efe8cc6dcc0526e7018ae9e0e3fc134e3` (committed 2026-10-22 09:37 UTC, `main`), cloned at `/home/user/openai/codex`. Where I quote a file path, it is relative to that clone. This is OpenAI's official source and is the ground truth the docs are generated from, so these facts are high-confidence for *current* behaviour — but they describe the development head, not necessarily the latest released binary.
- Exactly one `WebSearch` succeeded (a search-engine summary of `https://developers.openai.com/codex/config-reference` and `.../codex/concepts/sandboxing`), marked **[SEARCH-SNIPPET]**. After that the shared per-turn search budget was exhausted, so no further official doc pages could be read.
- The repo's `docs/*.md` files are now one-line stubs that link to the canonical pages on developers.openai.com; I cite those exact URLs as **[URL-FROM-REPO]** (the URL is verified to be the official location; the page body was NOT read).
- Anything from my own prior knowledge (cut-off mid-2026) that I could not confirm from the repo is marked **[UNVERIFIED]**. Pricing, plan limits, Codex Cloud behaviour, Slack/GitHub integration details and the Responses-API section are almost entirely [UNVERIFIED] and must be re-checked against the live pages before the PRD is finalised.

Official doc index (all [URL-FROM-REPO], linked from `docs/*.md` and `README.md` at the commit above):
- Docs root: https://developers.openai.com/codex
- Config basics / advanced / reference / sample: https://developers.openai.com/codex/config-basic , https://developers.openai.com/codex/config-advanced , https://developers.openai.com/codex/config-reference , https://developers.openai.com/codex/config-sample
- AGENTS.md guide: https://developers.openai.com/codex/guides/agents-md
- Auth: https://developers.openai.com/codex/auth (API-key section anchor `#sign-in-with-an-api-key`)
- Non-interactive (`codex exec`): https://developers.openai.com/codex/noninteractive
- Execution policy: https://developers.openai.com/codex/exec-policy
- CLI features: https://developers.openai.com/codex/cli/features ; slash commands: https://developers.openai.com/codex/cli/slash-commands
- Sandbox & approvals / security: https://developers.openai.com/codex/security ; concepts page https://developers.openai.com/codex/concepts/sandboxing (from search)
- Skills: https://developers.openai.com/codex/skills
- IDE extension: https://developers.openai.com/codex/ide
- Codex in ChatGPT plans (help center): https://help.openai.com/en/articles/11369540-codex-in-chatgpt
- Codex Web (cloud): https://chatgpt.com/codex ; desktop app: https://chatgpt.com/codex?app-landing-page=true
- Machine-readable full docs dump exists at https://developers.openai.com/codex/llms-full.txt and every page has a `.md` twin (e.g. `.../codex/config-reference.md`) [SEARCH-SNIPPET]. Useful for an automated PRD refresh.

Product surfaces confirmed in the repo [REPO `README.md`, `codex-rs/cli/src/main.rs`]: Codex CLI (`codex`, Rust, Apache-2.0), IDE extension (VS Code/Cursor/Windsurf), desktop app (`codex app`, macOS+Windows only — `#[cfg(any(target_os="macos", target_os="windows"))]`), Codex Web/Cloud (`chatgpt.com/codex`, `codex cloud` CLI), app-server (JSON-RPC backend used by IDE/app), TypeScript SDK `@openai/codex-sdk`, Python SDK `openai-codex`.

Install [REPO README.md]: `curl -fsSL https://chatgpt.com/codex/install.sh | sh` (mac/Linux), `irm https://chatgpt.com/codex/install.ps1 | iex` (Windows), `npm install -g @openai/codex`, `brew install --cask codex`. Binaries download from `https://releases.openai.com/codex` with GitHub Releases fallback (`CODEX_INSTALLER_USE_RELEASES_OPENAI_COM=false` forces GitHub). System requirements [REPO docs/install.md]: macOS 12+, Ubuntu 20.04+/Debian 10+, Windows 11 via WSL2 (native Windows sandbox also exists, see §3); 4 GB RAM min.

---

## 1. Project instructions (AGENTS.md)

Official page: https://developers.openai.com/codex/guides/agents-md [URL-FROM-REPO].

Discovery algorithm [REPO `codex-rs/core/src/agents_md.rs` header comment, 2026-10-22]:
1. Determine the project root by walking **upwards** from cwd until a `project_root_markers` entry is found; default marker list is `[".git"]`. No marker → only cwd is considered. An **empty** marker list disables parent traversal.
2. Collect every `AGENTS.md` from the project root **down to** the cwd (inclusive) and concatenate in that order.
3. Never walk past the project root.

Filenames [REPO same file]: `DEFAULT_AGENTS_MD_FILENAME = "AGENTS.md"`; `LOCAL_AGENTS_MD_FILENAME = "AGENTS.override.md"` ("preferred local override"). Per directory the candidate order is `AGENTS.override.md`, then `AGENTS.md`, then each `project_doc_fallback_filenames` entry (entries containing path separators are ignored).

Size limit [REPO `codex-rs/config/src/config_toml.rs:75`]: `DEFAULT_PROJECT_DOC_MAX_BYTES = 32 * 1024` (32 KiB) — config key `project_doc_max_bytes`; it is a *total* budget decremented as files are loaded (`remaining = config.project_doc_max_bytes`). Fallback key: `project_doc_fallback_filenames = []` (default empty).

Global/user instructions: user-level instructions and project docs are joined with the separator `"\n\n--- project-doc ---\n\n"` [REPO `AGENTS_MD_SEPARATOR`]. The historical `~/.codex/AGENTS.md` global file is documented on the guide page [UNVERIFIED — not located in this commit's core crate; the code refers to "host-provided user instructions"]. Config keys that also inject instructions [REPO config_toml.rs]: `instructions` (system instructions), `developer_instructions` (inserted as a `developer` role message), `compact_prompt`, `experimental_compact_prompt_file`, and per-profile `model_instructions_file` (path to a file with model instructions). Enterprise: `requirements.toml` can inject `additional_developer_instructions` [REPO `config_requirements.rs:199`].

`/init` slash command "create an AGENTS.md file with instructions for Codex" [REPO `codex-rs/tui/src/slash_command.rs`].

Project trust: AGENTS.md and `.codex/config.toml` from a project are loaded but **disabled when the directory is untrusted** (see §2 layers).

---

## 2. `config.toml`

Official pages: config-basic / config-advanced / config-reference / config-sample (URLs in §0). Location: `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`) [REPO loader/mod.rs]. Override any key from the CLI with `-c key=value` / `--config` (dotted paths, value parsed as TOML, falls back to literal string) [REPO `codex-rs/utils/cli/src/config_override.rs`]. `--strict-config` errors on unknown keys.

### Layering / precedence [REPO `codex-rs/config/src/loader/mod.rs:122-135`]
Lowest → highest: package defaults → admin (MDM managed preferences) → system `/etc/codex/config.toml` (Unix) or `%ProgramData%\OpenAI\Codex\config.toml` (Windows) → cloud (enterprise-managed cloud config bundle) → user `${CODEX_HOME}/config.toml` → profile `${CODEX_HOME}/<name>.config.toml` when selected → cwd `${PWD}/config.toml` → tree (parent dirs up to root, `./.codex/config.toml`) → repo `$(git rev-parse --show-toplevel)/.codex/config.toml` → runtime (`--config` flags, UI selectors). Project-level layers are "loaded but disabled when the directory is untrusted".

### Profiles [REPO `codex-rs/config/src/profile_toml.rs`]
Two mechanisms: (a) `[profiles.<name>]` tables in config.toml plus `profile = "<name>"` key or `--profile/-p <name>`; (b) "profile v2": a separate file `$CODEX_HOME/<name>.config.toml` layered on top of user config (`-p` help text: "Layer $CODEX_HOME/<name>.config.toml on top of the base user config"). Profile-settable keys: `model`, `service_tier` (`default`|`priority`|`flex`, legacy `fast`), `model_provider`, `approval_policy`, `approvals_reviewer`, `sandbox_mode`, `model_reasoning_effort`, `plan_mode_reasoning_effort`, `model_reasoning_summary`, `model_verbosity`, `model_catalog_json`, `chatgpt_base_url`, `model_instructions_file`, `include_*_instructions`, `tools`, `web_search`, `analytics`, `tui`, `windows`, `features`, `oss_provider`.

### Model keys [REPO config_toml.rs]
`model` (optional override; no hard-coded default slug found in this commit — the default comes from the server model catalog; slugs present in source include `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5.2-codex`, `gpt-5.2`, `gpt-5.1-codex-max`, `gpt-5.1-codex`, `gpt-5.1-codex-mini`, `gpt-5-codex`, `gpt-5`), `review_model` (for `/review`), `model_provider`, `model_context_window`, `model_reasoning_effort`, `plan_mode_reasoning_effort`, `model_reasoning_summary`, `model_verbosity` ("Responses API `text.verbosity`"), `service_tier`, `openai_base_url`, `chatgpt_base_url`, `responses_api_metadata` (map), `tool_output_token_limit`, `hide_agent_reasoning` (default false), `show_raw_agent_reasoning`, `personality` (deprecated values).
`model_reasoning_effort` values [REPO `codex-rs/protocol/src/openai_models.rs:62`]: `none | minimal | low | medium (default) | high | xhigh | max | ultra | persistent` plus unknown pass-through strings.

### Approval policy [REPO `codex-rs/protocol/src/protocol.rs:1097`]
`approval_policy` = `"untrusted"` (commands need approval unless an execpolicy rule allows) | `"on-request"` (**default**; alias `"on-failure"` accepted but deprecated) | `"never"` (failures returned to model, never escalated) | granular table `approval_policy = { granular = { sandbox_approval = bool, rules = bool, ... } }` (fine-grained; `false` auto-rejects that category). [SEARCH-SNIPPET of config-reference, 2026-10-22]: "on-failure is deprecated; use on-request for interactive runs or never for non-interactive"; the es-419/pt-BR versions say `untrusted` is no longer supported by Codex and ChatGPT Work — docs appear out of sync; code still parses it.
`approvals_reviewer` = `"user"` (default) | `"auto_review"` (alias `guardian_subagent`) — routes approvals through an automatic reviewer ("Guardian"); CLI flag `--approve-for-me` [REPO shared_options.rs]. `[auto_review]` table: `circuit_break_action = "default"|"strict"`, `policy`, `extra_policy` [REPO config_toml.rs:585-591; app-server README].

### Sandbox [REPO `codex-rs/protocol/src/config_types.rs:104`, `protocol.rs SandboxPolicy`]
`sandbox_mode` = `"read-only"` (**default**) | `"workspace-write"` | `"danger-full-access"`.
`[sandbox_workspace_write]`: `writable_roots = []` (extra dirs beyond cwd), `network_access = false` (**default false**), `exclude_tmpdir_env_var = false`, `exclude_slash_tmp = false` (by default `$TMPDIR` and `/tmp` are writable). CLI: `-s/--sandbox <mode>`, `--add-dir <DIR>` (extra writable dirs), `-C/--cd`.
Newer permission system [REPO config_toml.rs:236-243]: `default_permissions = ":<builtin>"` or a named profile from `[permissions]` table (e.g. `permissions.audit.filesystem = { ":root" = "read", "/path/.env" = "deny" }` — example from SDK README). `allow_login_shell`, `allow_symlinked_codex_home`.

### Shell environment policy [REPO `codex-rs/config/src/shell_environment_policy.rs`, `protocol/src/shell_environment.rs:141`]
`[shell_environment_policy]`: `inherit = "core"` (HOME, PATH, USER…; **default**) | `"all"` | `"none"`; `ignore_default_excludes = false` (default excludes are case-insensitive `*KEY*`, `*SECRET*`, `*TOKEN*`); `exclude = [...]` (legacy regex list), `include_only = [...]` (legacy), `set = { K = "V" }`, `filters = { pattern = action }` (canonical keyed form; requirements.toml accepts only this form), `experimental_use_profile`.

### Other top-level keys [REPO config_toml.rs — full list]
`notify = ["cmd", "args"]` (external command spawned for end-user notifications; legacy — JSON event passed as last arg [UNVERIFIED detail]); `[tui]` incl. `notifications` (bool or list) and `notification_method`; `[history] persistence = "save-all"|"none"`, `max_bytes`; `file_opener`; `log_dir`; `sqlite_home`; `[projects."/abs/path"] trust_level = "trusted"|"untrusted"` [REPO `ProjectConfig`, `TrustLevel`] — cwd entries take precedence over repo-root entries; `project_root_markers = [".git"]`; `check_for_update_on_startup`; `web_search = ...` (WebSearchMode) and `[tools] web_search`, `update_plan`; `[features]` (see below); `suppress_unstable_features_warning`; `[agents]` (§5); `[skills]` (§4); `[hooks]` (§2 hooks); `[plugins]`, `[marketplaces]`; `[mcp_servers.<id>]` (§6) plus `mcp_oauth_credentials_store`, `mcp_oauth_callback_port`, `mcp_oauth_callback_url`, `mcp_optional_startup_grace_ms`, `mcp_enterprise_managed_auth`; `forced_login_method = "chatgpt"|"api"`, `forced_chatgpt_workspace_id = "id" | ["id1","id2"]`, `cli_auth_credentials_store`; `background_terminal_max_timeout`; `thread_unload_delay_secs`; `[otel]`, `[analytics]`, `[feedback]`, `[apps]`, `[windows]`, `[cloud]`, `[orchestrator]`, `[memories]`, `[goals]`, `[realtime]`/`[audio]` (voice), `[ghost_snapshot]`, `oss_provider` (`ollama` | `lmstudio`, with `--oss` / `--local-provider`).

### Feature flags [REPO `codex-rs/features/src/lib.rs`; CLI `codex features`, `--enable <FEATURE>` / `--disable <FEATURE>`; `/experimental` menu]
`[features]` table of `key = true|false`. Each has a stage (Stable / Experimental / UnderDevelopment / Removed). Selected keys: `hooks` (**Stable, default true**), `multi_agent` (Stable, default true), `multi_agent_v2` (Stable, default false), `multi_agent_mode`, `enable_fanout`, `agent_message_board`, `code_mode` (JS "code mode" tool surface), `unified_exec`, `unified_exec_tty`, `web_search_request`, `web_search_cached`, `standalone_web_search`, `search_tool`, `tool_search`, `plugins`, `plugin_hooks`, `apps`, `enable_mcp_apps`, `mcp_2026_07_28`, `use_linux_sandbox_bwrap`, `use_legacy_landlock`, `experimental_windows_sandbox`, `elevated_windows_sandbox`, `windows_sandbox_service`, `network_proxy`, `credential_masking`, `worktrees` (removed/always on), `memories`, `chronicle`, `browser_use`, `computer_use`, `in_app_browser`, `request_permissions_tool`, `exec_permission_approvals`, `shell_snapshot`, `js_repl`, `sqlite`, `codex_git_commit`, `remote_models`, `api_key_model_discovery`, `daemon_auto_start`, `tui_multi_backend`, `secret_auth_storage`.

### Model providers [REPO `codex-rs/model-provider-info/src/lib.rs:109-193`]
`[model_providers.<id>]`: `name`, `base_url`, `env_key` (env var holding API key; preferred), `env_key_instructions`, `experimental_bearer_token` (discouraged), `auth` (command-backed bearer token), `gateway_oauth`, `aws` (SigV4 — Amazon Bedrock providers are built in: `AMAZON_BEDROCK_PROVIDER_ID`, `AMAZON_BEDROCK_RUNTIME_PROVIDER_ID`), `wire_api` — **only `"responses"` exists in this commit** (`enum WireApi { Responses }`; the former `"chat"` Chat-Completions wire has been removed — custom endpoints must be Responses-API compatible), `capabilities` overrides, `query_params` (used for Azure `api-version`), `http_headers`, `env_http_headers`, `request_max_retries`, `stream_max_retries`, `stream_idle_timeout_ms`, `websocket_connect_timeout_ms`, `requires_openai_auth`, `model_catalog_url`. Built-in reserved IDs: `openai`, `ollama`, `lmstudio`, bedrock ×2 — cannot be overridden. Azure example (`base_url = "https://<res>.openai.azure.com/openai"`, `query_params = { api-version = "..." }`, `env_key = "AZURE_OPENAI_API_KEY"`) [UNVERIFIED exact values; pattern consistent with the struct].

### Hooks (exist — "Claude-style lifecycle hooks") [REPO `codex-rs/hooks/`, `codex-rs/config/src/hook_config.rs`, feature `hooks` Stable/default-on]
- Defined in `hooks.json` files discovered per config layer (`<config folder>/hooks.json`, i.e. `~/.codex/hooks.json`, project `.codex/hooks.json`, plugin `hooks/hooks.json`) and/or `[hooks]` in config.toml (`[hooks.events]`, `[hooks.state.<id>] enabled / trusted_hash`).
- Events [REPO `HookEventsToml`]: `pre_model_request`, `post_model_request`, `pre_tool_use`, `permission_request`, `post_tool_use`, `pre_compact`, `post_compact`, `session_start`, `session_end`, `user_prompt_submit`, `subagent_start`, `subagent_stop`, `stop`, `interrupt`. Each is a list of `{ matcher?, hooks: [handler] }`.
- Handler types: `{"type":"command","command":"…","commandWindows":"…","timeout":sec,"async":bool,"statusMessage":"…","additionalContextLimit":tokens(default 2500)}`, `{"type":"mcp_tool","server":"…","tool":"…","input":{…}}`, `{"type":"prompt"}`, `{"type":"agent"}`.
- JSON schemas for every event's stdin/stdout in `codex-rs/hooks/schema/generated/*.schema.json`.
- Trust: hooks require persisted trust (hash); `--dangerously-bypass-hook-trust` bypasses for automation. `/hooks` slash command manages them.
- Enterprise: `allow_managed_hooks_only = true` in `requirements.toml` ignores user/project/session hooks while keeping managed hooks [REPO docs/config.md]; `[managed_hooks]` with `managed_dir` / `windows_managed_dir`.
- Legacy `notify` command still supported (`hooks/src/legacy_notify.rs`).

### Enterprise / managed configuration [REPO `codex-rs/config/src/loader/mod.rs:107-121`, `config_requirements.rs`]
Requirements (admin-enforced constraints) are collected from: system `/etc/codex/requirements.toml` (Unix) or `%ProgramData%\OpenAI\Codex\requirements.toml` (Windows) → cloud enterprise-managed bundle → legacy `/etc/codex/managed_config.toml` (reinterpreted as requirements) → MDM managed preferences (macOS domain `com.openai.codex`, key `requirements_toml_base64`). `managed_config.toml` under CODEX_HOME is no longer supported on Windows. Enforceable keys include: `allowed_login_methods`, `allowed_chatgpt_workspaces`, `cli_auth_credentials_store`, `chatgpt_base_url`, `model_provider(s)`, `model_catalog_json`, `approval_policy`, `approvals_reviewer`, `auto_review_required_models`, `permission_profile`, `windows_sandbox_mode`, `web_search_mode`, `allow_managed_hooks_only`, `allow_remote_control`, `managed_hooks`, `mcp_servers`, `plugins`, `marketplaces`, `exec_policy`, `enforce_residency`, `network`, `filesystem`, `application`, `additional_developer_instructions`, `feature_requirements`, `check_for_update_on_startup`, `allow_login_shell`. `/debug-config` shows "config layers and requirement sources"; app-server method `configRequirements/read`. Official admin page name [UNVERIFIED]: developers.openai.com/codex/enterprise/… ("Managed configuration / requirements").

---

## 3. Sandboxing & approvals

Official: https://developers.openai.com/codex/security [URL-FROM-REPO], https://developers.openai.com/codex/concepts/sandboxing [SEARCH-SNIPPET].

Mechanisms [REPO `codex-rs/sandboxing/src/`]:
- **macOS**: Seatbelt via `/usr/bin/sandbox-exec` (only that path is trusted) with SBPL policies (`seatbelt_base_policy.sbpl`, `seatbelt_network_policy.sbpl`, `seatbelt_read_only_platform_defaults.sbpl`).
- **Linux**: default pipeline is **bubblewrap (`bwrap`) + seccomp**, with PID-namespace policy (`linux_pid_namespace.rs`); **Landlock** retained as legacy fallback (feature `use_legacy_landlock`; `use_linux_sandbox_bwrap`). Helper crates `codex-rs/bwrap`, `codex-rs/linux-sandbox`.
- **Windows**: native sandbox using restricted tokens + job objects + capability SIDs (`windows-sandbox-rs/src/token.rs`, `process.rs`), optional elevated mode and a Windows sandbox service (features `experimental_windows_sandbox`, `elevated_windows_sandbox`, `windows_sandbox_service`; `/elevate-sandbox` slash command). WSL2 remains the documented path.
- A managed network proxy can run for sandboxed sessions with credential masking (`network_proxy`, `credential_masking` features; `codex-rs/network-proxy`).
- `codex sandbox <cmd>` runs arbitrary commands inside the Codex sandbox; env var `CODEX_SANDBOX` is set inside.

Policy semantics [REPO `SandboxPolicy`]: `read-only` (no writes; network off by default), `workspace-write` (cwd + `writable_roots` + `$TMPDIR` + `/tmp` writable; network **off by default** unless `network_access = true`), `danger-full-access`, plus `ExternalSandbox` (already sandboxed externally; honours a network flag). Presets per docs [SEARCH-SNIPPET]: "full access" = `sandbox_mode="danger-full-access"` + `approval_policy="never"`; the docs still describe `--full-auto` as `workspace-write` + `on-request` — **but no `--full-auto` flag exists in the CLI source at this commit** (grep returns nothing); treat `--full-auto` as removed/legacy [REPO].
Escalation: with `on-request` the model may ask to run a command outside the sandbox or with extra permissions (`exec_permission_approvals`, `request_permissions_tool`, "with_additional_permissions"/"require_escalated" requests); user approves in TUI or client receives `item/commandExecution/requestApproval` / `item/permissions/requestApproval` over app-server.
Bypass: `--dangerously-bypass-approvals-and-sandbox` (alias **`--yolo`**) = no prompts, no sandbox, "EXTREMELY DANGEROUS. Intended solely for running in environments that are externally sandboxed" [REPO shared_options.rs:52-58]. `-a/--ask-for-approval <policy>` (TUI), `-s/--sandbox <mode>`.
Execution policy [REPO `codex-rs/execpolicy/README.md`; page https://developers.openai.com/codex/exec-policy]: Starlark `.rules` files (`prefix_rule(pattern=[...], decision="allow"|"prompt"|"forbidden", justification, match, not_match)`, `host_executable(name, paths)`), loaded from each config layer's `rules/` dir (`~/.codex/rules/default.rules`, project `.codex/rules/*.rules`), higher layers override; `--ignore-rules` skips user/project rules; requirements.toml can ship `exec_policy`.

---

## 4. Skills, custom prompts, slash commands

Official: https://developers.openai.com/codex/skills [URL-FROM-REPO]; https://developers.openai.com/codex/cli/slash-commands [URL-FROM-REPO].

Skills [REPO `codex-rs/skills/`]: a skill is a directory containing `SKILL.md` (const `SKILL_FILENAME`), YAML front-matter fields `name`, `description`, optional `short_description`, `interface` (`display_name`, `icon_small`, `icon_large`, `brand_color`, `default_prompt`), `dependencies.tools` (required MCP/app tools), `policy` (`allow_implicit_invocation`, `products`). Scopes: `User`, `Repo`, `System`, `Admin` (+ plugin-provided). Bundled "system" skills are installed to `$CODEX_HOME/skills/.system` (`imagegen`, `openai-docs`, `review-agent`, `skill-creator`, `skill-installer`). Directory conventions (`.agents/skills/` in repo, `~/.agents/skills` / `$CODEX_HOME/skills` for user, `/etc/codex/skills` admin) [UNVERIFIED exact paths — the loader is abstracted behind `PluginSkillRoot`; the `.agents` dir is referenced in protocol tests]. Explicit invocation: `$skill-name` mention sigil (`TOOL_MENTION_SIGIL = '$'`), also `[$name](skill://path)` links; `/skills` slash command. Config `[skills]`: `include_instructions`, `max_context_tokens` (default 2 % of context window, cap 10 000), `[[skills.config]] { name|path, enabled }`, `bundled.enabled`; app-server `skills/list`, `skills/extraRoots/set`.

Custom prompts: historically `~/.codex/prompts/*.md` exposed as `/name` [UNVERIFIED for this commit — the TUI now has `/presets` "run or save reusable prompts and slash commands" and a `custom_prompt_view`; the `prompts` dir constant was not found in core].

Slash commands at this commit [REPO `codex-rs/tui/src/slash_command.rs`]: `/model /presets /daybreak /ide /permissions /keymap /vim /elevate-sandbox /experimental /auto-review /memories /skills /import /hooks /review /rename /new /archive /delete /resume /fork /worktree /app /init /compact /config /recap /plan /voice /goal /agents /side /btw /copy /export /raw /tui /diff /mention /status /daemon /warnings /cd /pwd /usage /debug-config /title /statusline /theme /pets /mcp /apps /plugins /logout /quit /exit /feedback /rollout /ps /stop /clear /multi-agents`. Notables: `/import` imports "setup, this project, and recent chats from Claude Code"; `/usage` shows account usage / limit reset; `/ps` + `/stop` manage background terminals.

---

## 5. Subagents / multi-agent, background terminals, worktrees

[REPO] `[agents]` table (`config_toml.rs:755-812`): `enabled = true` (default), `max_concurrent_threads_per_session`, `max_depth` (V1 only), `default_subagent_model`, `default_subagent_reasoning_effort`, `interrupt_message = true`, and roles: `[agents.<role>] description = "…", config_file = "./agents/<role>.toml", nickname_candidates = [...]`. Features: `multi_agent` (stable, on), `multi_agent_v2` (stable, off by default; "task-path-based routing"), `multi_agent_v2_dynamic_tools`, `subagent_thread_environments`, `subagent_default_context_limits`, `agent_message_board`, `enable_fanout`, `wake_on_agent_messages`, `defer_mailbox_preemption`, `collab` tools. Crates: `agent-roles`, `agent-message-board-client`, `agent-graph-store`, `collaboration-mode-templates` (templates `default.md`, `plan.md` → `/plan` "Plan mode"). Hooks `subagent_start`/`subagent_stop`. exec JSONL item `collab_tool_call` with agent states. TUI `/agents` ("agent command center"), `/multi-agents`, `codex agents` (browse sessions on the shared local daemon).
Background terminals: `background_terminal_max_timeout` key; app-server `thread/backgroundTerminals/{list,terminate,clean}`; TUI `/ps`, `/stop`.
Worktrees: `--worktree` flag ("Run the session in a new managed Git worktree"), `/worktree` command, crate `codex-rs/worktree`; feature `worktrees` is now always-on ("Managed worktrees and repository-aware sessions are always available").
Daemon: `codex` can run a shared local app-server daemon (`daemon_auto_start`), `/daemon`, `codex remote-control` (experimental; `allow_remote_control` requirement).

---

## 6. MCP

Official MCP page [UNVERIFIED URL]: https://developers.openai.com/codex/mcp.

Client config [REPO `codex-rs/config/src/mcp_types.rs`]: `[mcp_servers.<name>]` with either stdio (`command`, `args`, `env = {..}`, `env_vars`, `cwd`) or streamable HTTP (`url`, `bearer_token_env_var`, `http_headers`, `env_http_headers`, `http_headers_helper` = local command printing JSON headers). Common keys: `enabled`, `required` (exec fails if server fails to init), `startup_readiness = "catalog"|…`, `startup_timeout_sec`, `tool_timeout_sec`, `enabled_tools = [...]` (allow-list), `disabled_tools = [...]` (deny-list applied after), `default_tools_approval_mode`, `[mcp_servers.<name>.tools.<tool>]` per-tool settings, `scopes`, `oauth` (client settings), `oauth_resource` (RFC 8707), `supports_parallel_tool_calls`, `tool_input_schema_max_bytes` (default 5000), `omit_tools_from`, `environment_id`, `auth` (incl. enterprise-managed auth / EMA). Tool names are prefixed `mcp__<server>__…` unless `non_prefixed_mcp_tool_names` feature.
CLI [REPO `codex-rs/cli/src/mcp_cmd.rs`]: `codex mcp list | get <name> | add <name> [--env K=V] -- <command…> | add <name> --url <URL> [--bearer-token-env-var VAR] [--oauth-client-id ID] [--oauth-client-secret S] [--oauth-client-registration …] [--oauth-resource R] | remove <name> | login <name> | logout <name>`. OAuth: browser login with local callback (`mcp_oauth_callback_port/url`), credential store mode `mcp_oauth_credentials_store`, feature `mcp_oauth_refresh_coordination`. `/mcp` shows status; app-server `mcpServer/oauth/login`, `mcpServerStatus/list`, `config/mcpServer/reload`.
Codex as a server: subcommand is `codex app-server` (JSON-RPC, "[experimental]"), transports `--listen stdio://` (default) | `unix://[PATH]` | `ws://IP:PORT` | `off`, `--stdio` [REPO cli/src/main.rs:590-606]. An older `codex mcp-server` (MCP-protocol server exposing a `codex` tool) existed previously [UNVERIFIED — the `codex-rs/codex-mcp` crate exists but no `mcp-server` subcommand is in the CLI enum at this commit]. app-server protocol (crate `codex-rs/app-server-protocol`, v2; docs `codex-rs/docs/protocol_v1.md`): `initialize` (capabilities incl. `experimentalApi`), `thread/start|resume|fork|list|read|archive|delete|compact/start|items/list|queue/*|goal/*|name/set|metadata/update`, `turn/start|…`, `review/start`, streaming notifications `item/started|completed`, `item/agentMessage/delta`, `item/commandExecution/outputDelta|requestApproval`, `item/fileChange/requestApproval`, `item/reasoning/*`, `item/tool/requestUserInput`, `account/login/start|read|rateLimits/read|usage/read`, `model/list`, `skills/list`, `hooks/list`, `plugin/*`, `fs/*`, `command/exec`, `environment/*`, `config/read|value/write|batchWrite`, `configRequirements/read`, realtime voice `thread/realtime/*`. Client libs: `codex-rs/app-server-client`, `app-server-test-client`.

---

## 7. Headless / programmatic

Official: https://developers.openai.com/codex/noninteractive [URL-FROM-REPO]; SDK page [UNVERIFIED URL] https://developers.openai.com/codex/sdk.

`codex exec` (alias `codex e`) [REPO `codex-rs/exec/src/cli.rs`]: `codex exec [PROMPT|-]` (stdin used when prompt omitted/`-`; piped stdin appended as `<stdin>` block). Flags: `--json` (JSONL events to stdout), `-o/--output-last-message <FILE>`, `--output-schema <FILE>` (JSON Schema for final response), `--ephemeral` (no session files persisted), `--skip-git-repo-check`, `--ignore-user-config`, `--ignore-rules`, `--strict-config`, `--color`, `--thread-source`, `--cyber-access-program`, plus shared: `-m/--model`, `-p/--profile`, `-s/--sandbox`, `--approve-for-me`, `--dangerously-bypass-approvals-and-sandbox|--yolo`, `--dangerously-bypass-hook-trust`, `-C/--cd`, `--worktree`, `--add-dir`, `-i/--image`, `--oss`, `--local-provider`, `-c key=value`. Subcommands: `codex exec resume [<id>|--last] [--all] [PROMPT]`, `codex exec fork <id> [PROMPT]`, `codex exec review --uncommitted | --base <branch> | --commit <sha> [--title]` (also top-level `codex review`). Non-interactive runs use `approval_policy=never` semantics; logging defaults `RUST_LOG=error` [REPO docs/install.md].
JSONL schema [REPO `codex-rs/exec/src/exec_events.rs`]: event `type` ∈ `thread.started` (thread_id), `turn.started`, `turn.completed` (usage: input/cached/output tokens), `turn.failed`, `item.started|item.updated|item.completed` (item types `agent_message`, `reasoning`, `command_execution`, `file_change`, `mcp_tool_call`, `collab_tool_call`, `web_search`, `todo_list`, `error`), `error`.
Exit codes [REPO exec/src/lib.rs]: `0` on success; `1` on any fatal error (config load failure, auth, turn failure, required MCP server failure) — no finer-grained codes found.
Sessions persist under `~/.codex/sessions` (SDK README) — resumable via `codex resume`/`codex exec resume`; `codex fork`, `codex archive`, `codex delete`, `codex queue` (queue a message for an existing session).
TypeScript SDK [REPO `sdk/typescript/README.md`]: `npm install @openai/codex-sdk` (Node 18+), spawns the bundled CLI and exchanges JSONL. `new Codex({ env?, baseUrl?, apiKey?, config?: object, configOverrides?: string[] })`; `codex.startThread({ workingDirectory, skipGitRepoCheck, model, sandboxMode, approvalPolicy, modelReasoningEffort, networkAccessEnabled, webSearchMode|webSearchEnabled, additionalDirectories })`; `thread.run(prompt | [{type:"text"},{type:"local_image",path}], { outputSchema })` → `{ finalResponse, items, usage }`; `thread.runStreamed()` → async generator of the same events; `codex.resumeThread(id)`; SDK injects `CODEX_API_KEY`. Python SDK [REPO `sdk/python/README.md`]: `pip install openai-codex`; `Codex().thread_start().run(...)` → `TurnResult(final_response, items, usage)`; `login_chatgpt()`, `login_chatgpt_device_code()`, `login_api_key()`; docs in `sdk/python/docs/`.

---

## 8. Codex Cloud (Codex Web), GitHub, Slack, automations

Official entry: https://chatgpt.com/codex [URL-FROM-REPO]. Cloud doc pages [UNVERIFIED URLs]: https://developers.openai.com/codex/cloud , …/cloud/environments , …/cloud/internet-access , …/cloud/code-review , …/integrations/github , …/integrations/slack .
Verified in repo [REPO `codex-rs/cloud-tasks/src/cli.rs`]: `codex cloud` (alias `cloud-tasks`) TUI plus `codex cloud exec "<prompt>" --env <ENV_ID> [--attempts N] [--branch B]` (best-of-N attempts), `codex cloud status <task>`, `codex cloud list [--env] [--limit 1-20] [--cursor] [--json]`, `codex cloud apply <task> [--attempt N]`, `codex cloud diff <task> [--attempt N]`. Environments are identified by env IDs; crates `cloud-client`, `cloud-config` (enterprise cloud config bundles feed the config layer stack), `cloud-tasks-client`.
From prior knowledge [UNVERIFIED, re-check]: cloud environments are per-repo containers configured in ChatGPT (setup script, env vars/secrets, container image, "internet access" policy = off / limited allow-list of domains + HTTP methods / full, agent internet off by default during the task phase); GitHub integration: `@codex` mention in PR comments to request review or changes, automatic PR code review toggle per repo ("Codex code review"), opens PRs from tasks; Slack app: mention `@Codex` in channels to start tasks; "Automations" / scheduled tasks in the Codex app [UNVERIFIED]; cloud tasks count toward the same plan usage limits with Business/Enterprise able to buy credits.

---

## 9. Authentication & usage

Official: https://developers.openai.com/codex/auth [URL-FROM-REPO]; plan details https://help.openai.com/en/articles/11369540-codex-in-chatgpt [URL-FROM-REPO].
[REPO] `codex login` (browser OAuth "Sign in with ChatGPT"), `codex login --device-auth` (device code), `codex login --with-api-key` (API key read from stdin), `--with-access-token`, `--api-key`, `codex login status`, `codex logout`. README recommends ChatGPT sign-in "as part of your Plus, Pro, Business, Edu, or Enterprise plan"; API-key use "requires additional setup". Env vars: `CODEX_API_KEY` (used by SDK), `OPENAI_API_KEY`, `CODEX_ACCESS_TOKEN`, `CODEX_AUTH`; credentials in `$CODEX_HOME/auth.json` or OS keyring/encrypted store (`cli_auth_credentials_store`, feature `secret_auth_storage`). Enterprise can force `forced_login_method = "chatgpt"|"api"` and `forced_chatgpt_workspace_id`. Rate-limit telemetry exposed to clients: `RateLimitSnapshot { primary, secondary }` each `RateLimitWindow { used_percent, window_minutes, resets_at }` (i.e. a 5-hour window and a weekly window) and `account/rateLimitResetCredit/consume`, `account/sendAddCreditsNudgeEmail` → "credits" and "limit reset" mechanics exist [REPO protocol.rs:2498-2564; app-server methods]; feature `analytics_plan_history` "Preview consumer five-hour and weekly allowance history".
[UNVERIFIED, from prior knowledge] Plan limits: Plus/Business ≈ 30–150 local messages per 5 h, weekly cap; Pro ≈ 300–1 500 per 5 h; cloud tasks have separate (higher) allowances; Free/Go have limited access; Enterprise/Edu admins can enable per-user limits and purchase **Codex credits** ($/credit top-ups usable after limits). Third-party harness policy: OpenAI's terms state that ChatGPT-subscription (OAuth) login is for use in OpenAI's own Codex surfaces (CLI/IDE/app/cloud) and that programmatic/third-party products should use API keys (billed per token); using ChatGPT OAuth tokens from unofficial clients is disallowed. The TypeScript SDK is officially sanctioned and reuses `codex login` credentials.

---

## 10. Models, pricing, Responses API [ALL UNVERIFIED — platform.openai.com unreachable]

Model IDs seen in source [REPO]: `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5.2-codex`, `gpt-5.2`, `gpt-5.1-codex-max`, `gpt-5.1-codex`, `gpt-5.1-codex-mini`, `gpt-5-codex`, `gpt-5`, `gpt-5-mini`. Prices (USD per 1M tokens, input / cached / output) from prior knowledge [UNVERIFIED]: gpt-5 / gpt-5.1 / gpt-5.2 ≈ $1.25 / $0.125 / $10; gpt-5-codex and gpt-5.1-codex same as base; gpt-5.1-codex-mini ≈ $0.25 / $0.025 / $2; gpt-5.1-codex-max ≈ $1.25/$10; gpt-5-mini ≈ $0.25/$2. Verify at https://platform.openai.com/docs/pricing and https://platform.openai.com/docs/models.
Responses API essentials for agent builders [UNVERIFIED]: `POST /v1/responses` with `input` items, `tools` (function, `web_search`, `file_search`, `computer_use`, `code_interpreter`, `mcp` remote servers, `shell`/`apply_patch` for codex models), `previous_response_id` or `conversation` for state, `reasoning: {effort, summary}` and encrypted `reasoning` items (`include: ["reasoning.encrypted_content"]` for stateless use), `background: true` for long jobs (poll/stream by id), `store`, `truncation: "auto"`, `text.verbosity`, `text.format` json_schema structured outputs, `service_tier` (`priority`/`flex`), context "compaction" endpoint / `context_management` for long agent loops. Codex itself speaks only this wire protocol (`WireApi::Responses`).

---

## 11. Security docs

Official: https://developers.openai.com/codex/security [URL-FROM-REPO] (the repo's `docs/sandbox.md` "Sandbox & approvals" points here). Repo `SECURITY.md` exists at root (vulnerability reporting). Mechanisms verified in code: sandbox + approvals (§3); secret filtering of env (`*KEY*`, `*SECRET*`, `*TOKEN*`); `credential_masking` + managed network proxy; Guardian auto-review classifier (`[features.guardian_v2]` / `approvals_reviewer="auto_review"`, review_threshold, classifier_instructions, circuit breaker) [REPO features/feature_configs.rs]; hook trust hashes; project trust gating of `.codex/config.toml`, AGENTS.md, rules and hooks; `permissions` deny-read lists; requirements can set `filesystem`/`network` constraints and `enforce_residency`; execpolicy `forbidden` rules. Prompt-injection guidance (treat tool output / web content / MCP results as untrusted, keep network off, review diffs) lives on the security page and the Python SDK "Untrusted external messages" doc (`sdk/python/docs/api-reference.md#externalmessage`) [URL-FROM-REPO; body not read].
