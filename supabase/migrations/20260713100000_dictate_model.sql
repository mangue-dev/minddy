-- minddy — modèle IA de l'étape agentique après dictée vocale (dictate-issue)
-- Distinct du modèle global de Numo (assistant_model) : on veut ici un modèle
-- rapide et pas cher pour transformer le transcript en patch d'issue.
-- Configurable en base comme les autres modèles. Idempotent — safe to re-run.

insert into public.app_config (key, value)
values ('dictate_model', 'google/gemini-3.1-flash-lite')
on conflict (key) do nothing;
