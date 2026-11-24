-- D-591 (live test 24.11.2026): a conversation on a spent subscription stops with its own status, "limit", and its error
-- keeps when the limit resets. Before, it was "failed" with "the subscription CLI exited 1".
alter table public.conversations drop constraint if exists conversations_status_check;
alter table public.conversations add constraint conversations_status_check
  check (status in ('idle', 'queued', 'running', 'budget', 'expired', 'overloaded', 'failed', 'limit'));
