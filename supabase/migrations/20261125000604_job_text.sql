-- D-604 (live test 25.11.2026, run 8): a job's task text carries the whole approved spec and the oracle's API; at 4000
-- characters the API lost its last items and the spec was cut to about 1000 characters. A person's own task stays ≤ 4000
-- (the web form and the API body check it).
alter table public.tasks drop constraint if exists tasks_text_check;
alter table public.tasks add constraint tasks_text_check check (length(text) >= 1 and length(text) <= 16000);
