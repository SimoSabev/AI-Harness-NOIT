-- D-446: a running task says what it is doing. Two kinds only the worker writes (never an agent's text): the phase of the
-- run and a provider problem, both closed sets of codes; the UI maps them to fixed text.
alter table public.session_lines drop constraint if exists session_lines_kind_check;
alter table public.session_lines add constraint session_lines_kind_check
  check (kind in ('init', 'text', 'step', 'tool_call', 'tool_result', 'permission', 'subagent_start', 'subagent_stop', 'usage', 'result', 'unparsed', 'phase', 'provider'));
