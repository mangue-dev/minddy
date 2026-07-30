-- minddy — MIN-122 : niveau de raisonnement de l'agent de code
--
-- Le niveau (`off` / `low` / `medium` / `high`) est FIGÉ sur le run, exactement
-- comme `model` : un run est découpé en chunks repris par des invocations
-- serverless successives, un état en mémoire n'y survivrait pas. Et un défaut
-- perso, comme `default_model`, pour ne pas le rechoisir à chaque lancement.
--
-- `off` par défaut : c'est le comportement d'avant MIN-122 à l'octet près, et le
-- seul défaut sûr — un champ de raisonnement envoyé à un endpoint qui ne
-- l'accepte pas revient en 400.
-- Idempotent — safe to re-run.

alter table public.agent_runs
  add column if not exists reasoning_level text not null default 'off';

alter table public.agent_runs drop constraint if exists agent_runs_reasoning_level_check;
alter table public.agent_runs add constraint agent_runs_reasoning_level_check
  check (reasoning_level in ('off', 'low', 'medium', 'high'));

-- Null = pas de préférence → le lancement retombe sur `off`.
alter table public.user_agent_preferences
  add column if not exists default_reasoning_level text;

alter table public.user_agent_preferences
  drop constraint if exists user_agent_preferences_default_reasoning_level_check;
alter table public.user_agent_preferences
  add constraint user_agent_preferences_default_reasoning_level_check
  check (default_reasoning_level is null
         or default_reasoning_level in ('off', 'low', 'medium', 'high'));
