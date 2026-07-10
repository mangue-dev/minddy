-- minddy — MIN-37 : deux types d'intégrations API.
-- Une clé mdy_ est désormais dédiée à UN usage : créer des issues directement
-- (POST /api/v1/issues, l'historique) ou déposer du feedback votable
-- (POST /api/v1/feedback). Les clés existantes restent des clés issues.
-- Idempotent — safe to re-run.

alter table public.integrations
  add column if not exists kind text not null default 'issues'
  check (kind in ('issues', 'feedback'));
