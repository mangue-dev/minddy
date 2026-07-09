-- minddy — Smart Assign (MIN-31)
-- Attribution automatique des tickets actifs sans assigné : opt-in par projet
-- (owner-only, futur gating par offre), règles libres par membre (jsonb
-- user_id → texte, porté par le projet car le owner n'a pas de ligne
-- project_members), modèle IA configuré en base comme numo/transcription.
-- Les événements portent via_smart_assign pour que la timeline affiche
-- « Smart Assign » comme acteur (même mécanique que via_assistant).
-- Idempotent — safe to re-run.

alter table public.projects
  add column if not exists smart_assign_enabled boolean not null default false;

alter table public.projects
  add column if not exists smart_assign_rules jsonb not null default '{}'::jsonb;

alter table public.issue_events
  add column if not exists via_smart_assign boolean not null default false;

insert into public.app_config (key, value)
values ('smart_assign_model', 'deepseek/deepseek-v4-flash')
on conflict (key) do nothing;
