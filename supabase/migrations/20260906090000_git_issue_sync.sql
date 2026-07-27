-- minddy — Synchronisation unidirectionnelle GitHub/GitLab → minddy (MIN-97)
-- Les issues du dépôt lié (MIN-47) deviennent des tickets minddy, et leur statut
-- suit l'état distant. Sens unique strict : minddy n'écrit JAMAIS chez le provider.
--
-- Des colonnes plutôt qu'une table de mapping : le toggle et ses traces sur
-- project_git_links, l'identité distante sur issues. L'index UNIQUE ci-dessous
-- FAIT le dédoublonnage — une redélivrance de webhook est une violation 23505
-- avalée à l'insert, il n'y a rien à vérifier avant.
-- RLS inchangée (les colonnes suivent les policies de leur table). Idempotent.

-- ── Toggle par liaison ──────────────────────────────────────────────────────
alter table public.project_git_links
  add column if not exists issue_sync_enabled boolean not null default false;

alter table public.project_git_links
  add column if not exists issue_sync_enabled_at timestamptz;

-- Dernier backfill réussi (les issues ouvertes existantes, à l'activation).
alter table public.project_git_links
  add column if not exists issue_sync_backfilled_at timestamptz;

-- Id du hook GitLab provisionné à l'activation (GitHub n'en a pas besoin : son
-- endpoint webhook est déclaré au niveau de l'App, pas du dépôt).
alter table public.project_git_links
  add column if not exists issue_sync_hook_id text;

-- ── Identité distante d'un ticket importé ───────────────────────────────────
alter table public.issues
  add column if not exists remote_provider text;

alter table public.issues
  add column if not exists remote_repo_id text;

-- GitHub `number` / GitLab `iid` — le numéro visible dans l'URL de l'issue.
alter table public.issues
  add column if not exists remote_number integer;

alter table public.issues
  add column if not exists remote_url text;

-- LE dédoublonnage : deux imports de la même issue distante dans le même projet
-- sont impossibles. Partiel, pour ne rien coûter aux tickets nés dans minddy.
create unique index if not exists idx_issues_remote_identity
  on public.issues(project_id, remote_provider, remote_repo_id, remote_number)
  where remote_provider is not null;

-- Fan-out du webhook : un event `issues` arrive avec un nom de dépôt, on cherche
-- toutes les liaisons ACTIVES de ce dépôt (plusieurs projets peuvent le lier).
create index if not exists idx_project_git_links_issue_sync
  on public.project_git_links(provider, repo_full_name)
  where issue_sync_enabled;

-- ── Attribution timeline ────────────────────────────────────────────────────
-- Le provider ('github' | 'gitlab') qui a produit l'événement : la timeline
-- affiche « GitHub » plutôt que le owner dont l'id sert techniquement d'acteur.
-- Même mécanique que via_smart_assign (20260719090000_smart_assign.sql), en
-- texte parce qu'il faut distinguer les deux forges.
alter table public.issue_events
  add column if not exists forge_sync text;
