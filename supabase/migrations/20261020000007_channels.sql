-- E3в (демо промпт т. 8.3, Ф3): channel metadata (never keys), routing per (repo, task_type), the channel of a task,
-- the spill (a NEW attempt, at most once per task).

alter table public.model_channels add column if not exists health text not null default 'ok' check (health in ('ok', 'degraded', 'down', 'limited'));
alter table public.model_channels add column if not exists budget_usd_day numeric(10, 4) check (budget_usd_day > 0);
alter table public.model_channels add column if not exists cooldown_until timestamptz;
alter table public.model_channels add column if not exists cooldown_s int check (cooldown_s between 1 and 3600);
alter table public.model_channels add column if not exists limit_resets_at timestamptz;
alter table public.model_channels add column if not exists last_error text check (length(last_error) <= 300);
alter table public.model_channels add column if not exists quality numeric(4, 3) not null default 0.8 check (quality between 0 and 1);
alter table public.model_channels add column if not exists cost numeric(4, 3) not null default 0.5 check (cost between 0 and 1);

alter table public.routing_rules add column if not exists repo_id uuid references public.repos (id) on delete cascade;
alter table public.routing_rules add column if not exists task_type text;
alter table public.routing_rules add column if not exists mode text not null default 'auto' check (mode in ('fixed', 'auto'));
alter table public.routing_rules add column if not exists fallback_channel_ids uuid[] not null default '{}';

alter table public.tasks add column if not exists channel_id uuid references public.model_channels (id) on delete set null;
alter table public.tasks add column if not exists channel_reason jsonb;
alter table public.tasks add column if not exists retry_reason text check (retry_reason in ('channel', 'auto', 'human'));
alter table public.tasks add column if not exists spills int not null default 0 check (spills between 0 and 1);
alter table public.channel_usage add column if not exists requests int not null default 0;
alter table public.channel_usage add column if not exists limited boolean not null default false;
