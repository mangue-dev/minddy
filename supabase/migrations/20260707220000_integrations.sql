-- minddy — Intégrations (API Feedback par projet)
-- Une clé API nommée, scopée à un projet, permet à un backend externe de
-- soumettre du feedback qui atterrit en issue au statut 'triage'. La révocation
-- est soft (revoked_at) — la ligne n'est jamais supprimée pour que
-- « créé par l'intégration X » survive dans le journal d'activité.
-- Idempotent — safe to re-run.

create table if not exists public.integrations (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  name         text not null,
  key_hash     text not null,          -- sha256 hex de la clé complète
  key_prefix   text not null,          -- ex. "mdy_Ab12Cd" pour affichage
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create unique index if not exists idx_integrations_key_hash on public.integrations(key_hash);
create index if not exists idx_integrations_project on public.integrations(project_id);

alter table public.integrations enable row level security;

-- Lecture = tout membre du projet (liste des settings + jointure timeline).
-- Toutes les écritures passent par le service client avec vérification owner
-- en TS (pattern issue_events). key_hash visible par les membres = inoffensif :
-- sha256 d'une clé aléatoire de 192 bits, non inversible et inutilisable pour
-- s'authentifier.
drop policy if exists integrations_select on public.integrations;
create policy integrations_select on public.integrations for select
  using (public.can_access_project(project_id));

-- Attribution : les issues/événements créés via une intégration portent son id
-- (created_by/actor_id restent NULL — il n'y a pas d'utilisateur derrière).
alter table public.issues
  add column if not exists integration_id uuid references public.integrations(id) on delete set null;

alter table public.issue_events
  add column if not exists integration_id uuid references public.integrations(id) on delete set null;
