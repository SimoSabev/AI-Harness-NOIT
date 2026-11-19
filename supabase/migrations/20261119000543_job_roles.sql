-- D-543 (М2 Х4): a model per role. A job may name another agent and model for its planner, advisor and writers
-- ({"planner": {"agent", "model"}, "advisor": …, "writer": …}); a role without its own choice uses the job's agent and model.

alter table public.jobs add column if not exists roles jsonb check (roles is null or (jsonb_typeof(roles) = 'object' and pg_column_size(roles) <= 4096));
