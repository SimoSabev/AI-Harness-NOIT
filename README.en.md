# Harness (no name yet) and Mandat

[Български](README.md)

**The harness** is the app: tasks, agents, accounts, sandboxes. It has no name yet. **Mandat** is the judge inside it:
the verdict (D1–D4), the trust ladder and the ledger. Mandat also works on its own (`mandat verify`, an MCP server,
a GitHub gate).

The harness is for AI coding agents. Every task becomes a changeset with a **verdict** (VERIFIED | FAILED | UNKNOWN)
from systems the agent cannot write to. The agent works in a Docker sandbox with no real API key and no network
beyond our gate. Changes leave only through a safe export, and the checks run in a fresh sandbox. Every verdict is a
row in a hash-chained ledger; `mandat verify-log` catches tampering.

## Quick start (your computer)
You need Node 24.22.0, pnpm 12.14.0 and Docker (Docker Desktop or dockerd). On Windows, use WSL and clone into `~/`.

```sh
pnpm install --frozen-lockfile
pnpm local            # build, database, sandbox images (5–15 min the first time), web UI and worker
```

`pnpm local` prints the address. There is no sign-in (D-368): on this computer you are the owner; the web listens on
127.0.0.1 only and approvals are a click, without a two-factor code. Open it, then **+ New task** → pick an agent → **Run the agent**.
The demo agents need no key:

| Agent | What it does | Expected |
| --- | --- | --- |
| Demo: honest fix | fixes the bug in `src/cart.ts` | Awaiting approval → Approve → Approved |
| Demo: deletes a test | deletes the failing test | Failed: “the test … is missing after the change” |
| Demo: skips a test | marks the test as skipped | Failed |
| Claude Code / Codex | real agents | a key in **Accounts** |

Other ways in:
- `pnpm desktop` — the same harness in its own window with a tray icon.
- `pnpm mandat tui` — the start page in the terminal (`MANDAT_LANG=bg` for Bulgarian).

## Language
The interface is in English by default and in Bulgarian on choice: **Settings → Language** (a cookie `lang`). Without
the cookie the browser's Accept-Language decides, otherwise English. All strings live in one catalog
(`apps/web/src/i18n/en.ts` and `bg.ts`); a test fails if a Bulgarian string appears anywhere else in `apps/web/src`.
Terms in both languages: [docs/glossary.md](docs/glossary.md).

## Development
```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check            # build, lint, types, unit tests with coverage, licences, no-dotenv
pnpm test:e2e         # Playwright + axe against `next start` (needs Postgres; see apps/web/playwright.config.ts)
pnpm test:docker      # sandbox tests (Docker ≥ 25.0.5; images: pnpm mandat images build)
```

## Where the docs are
The documents in `docs/` are in Bulgarian.
- [AGENTS.md](AGENTS.md) — the hard rules of the repository.
- [docs/prd/PRD.md](docs/prd/PRD.md) — the product (PRD v1.1); §4.1 is the terminology.
- [docs/progress.md](docs/progress.md) — phases and status.
- [docs/decisions.md](docs/decisions.md) — every decision with its “why” (D-numbers).
- [docs/setup/](docs/setup/) — what a person has to do (keys, accounts, GitHub Apps, the local live checklist).
- [docs/glossary.md](docs/glossary.md) — the bilingual glossary.

## Licences
Two groups: the core (Mandat: contract, core, ledger, export, sandbox, redaction, verify, gate-github, mcp) is
Apache-2.0; the harness (everything else) is GPL-3.0-or-later. Details in [README.md](README.md#лицензи).
