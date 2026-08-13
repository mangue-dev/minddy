-- Structured @ mentions for agent launch prompts and steering messages.
-- The visible text stays plain text; the ids travel beside it for the model and UI.

alter table public.agent_runs
  add column if not exists prompt_mentions jsonb;

alter table public.agent_run_messages
  add column if not exists mentions jsonb;
