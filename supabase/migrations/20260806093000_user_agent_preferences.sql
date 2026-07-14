-- minddy — MIN-46 : préférences agent par utilisateur
--
-- Le modèle par DÉFAUT PERSO de l'utilisateur pour l'agent de code. Cascade de
-- résolution d'un run : override du run > ce défaut perso > défaut racine
-- (app_config.agent_model). default_model null = suit le défaut racine.
--
-- Préférence strictement personnelle → RLS self-manage (comme conversations),
-- gérable via le cookie client. Idempotent — safe to re-run.

create table if not exists public.user_agent_preferences (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  default_model text,                 -- id OpenRouter, ou null (= défaut racine)
  updated_at    timestamptz not null default now()
);

alter table public.user_agent_preferences enable row level security;

drop policy if exists user_agent_preferences_select on public.user_agent_preferences;
create policy user_agent_preferences_select on public.user_agent_preferences for select
  using (user_id = (select auth.uid()));

drop policy if exists user_agent_preferences_insert on public.user_agent_preferences;
create policy user_agent_preferences_insert on public.user_agent_preferences for insert
  with check (user_id = (select auth.uid()));

drop policy if exists user_agent_preferences_update on public.user_agent_preferences;
create policy user_agent_preferences_update on public.user_agent_preferences for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop trigger if exists user_agent_preferences_set_updated_at on public.user_agent_preferences;
create trigger user_agent_preferences_set_updated_at
  before update on public.user_agent_preferences
  for each row execute function public.set_updated_at();
