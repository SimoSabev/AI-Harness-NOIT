-- E9в (spec 5.3, D-420): roles by model — each rule is for one role of a task (lead | subagent | research | review | summary);
-- a role without its own rule follows the lead rule (packages/contract ruleForRole).
alter table public.routing_rules add column if not exists role text not null default 'lead' check (role in ('lead', 'subagent', 'research', 'review', 'summary'));
