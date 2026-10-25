-- E8e (D-354): the worker vets an MCP server after a person approves it (outbox mcp_vet).
alter table public.outbox drop constraint if exists outbox_kind_check;
alter table public.outbox add constraint outbox_kind_check check (kind in ('check_run', 'draft_pr', 'ready_for_review', 'approval_check', 'merge', 'push_branch', 'web_push', 'harness_scan', 'harness_pr', 'proxy_restart', 'baseline', 'mcp_vet'));
