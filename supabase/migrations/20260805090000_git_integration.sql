-- minddy — MIN-47 : Intégration git (GitHub / GitLab)
--
-- Deux tables, calquées sur AutoKap (github_installations + github_repo_links),
-- pour lier un dépôt GitHub/GitLab à un projet minddy. L'intégration porte des
-- droits read+write (pour le futur agent de code, MIN-46) mais reste INERTE
-- pour l'instant : aucun code ne la consomme, pas de webhooks, pas de seam
-- reader/writer.
--
--  • git_connections   = le compte provider connecté, au niveau UTILISATEUR
--    (auth.users) → réutilisable sur tous ses projets, comme les clés api_keys.
--    GitHub : GitHub App, on ne stocke QUE l'installation_id (les tokens sont
--    mintés à la volée). GitLab : OAuth, tokens access+refresh chiffrés au repos.
--  • project_git_links = la liaison projet ↔ dépôt (un seul dépôt par projet),
--    pointe vers une git_connections + dénormalise l'installation_id GitHub.
--
-- RLS : lecture propriétaire (git_connections) / membres du projet
-- (project_git_links) ; TOUTES les écritures passent par le service client avec
-- vérification en TS (pattern api_keys / integrations). Aucune policy d'écriture.
-- Idempotent — safe to re-run.

-- ── Comptes provider connectés (niveau compte) ─────────────────────────────
create table if not exists public.git_connections (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  -- 'github' | 'gitlab'. Pas de CHECK volontairement : le registre
  -- lib/repo-providers.ts fait autorité sur les providers valides (permet
  -- d'ajouter un provider sans migration).
  provider                text not null,
  installation_id         bigint,          -- GitHub App install id (null en OAuth)
  provider_account_id     text,            -- id numérique du compte GitLab
  account_login           text,            -- login/username affiché
  account_type            text,            -- GitHub 'User' | 'Organization'
  repository_selection    text,            -- GitHub 'all' | 'selected'
  access_token_encrypted  text,            -- OAuth (GitLab) : enveloppe AES-256-GCM
  refresh_token_encrypted text,
  token_expires_at        timestamptz,
  oauth_scopes            text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Une installation GitHub est unique globalement (un install = un compte).
create unique index if not exists idx_git_connections_installation
  on public.git_connections(installation_id) where installation_id is not null;
-- Reconnexion OAuth du même compte GitLab → upsert (dé-duplique par utilisateur).
create unique index if not exists idx_git_connections_account
  on public.git_connections(user_id, provider, provider_account_id)
  where provider_account_id is not null;
create index if not exists idx_git_connections_user
  on public.git_connections(user_id);

alter table public.git_connections enable row level security;

-- Lecture = le propriétaire uniquement (liste des settings du compte). Les
-- colonnes de tokens ne sont JAMAIS renvoyées par l'API (select de colonnes
-- explicites côté serveur). Écritures = service client seulement.
drop policy if exists git_connections_select on public.git_connections;
create policy git_connections_select on public.git_connections for select
  using (user_id = (select auth.uid()));

-- ── Liaison projet ↔ dépôt (niveau projet) ─────────────────────────────────
create table if not exists public.project_git_links (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null unique references public.projects(id) on delete cascade,
  connection_id    uuid not null references public.git_connections(id) on delete cascade,
  provider         text not null,
  installation_id  bigint,                 -- dénormalisé (mint du token GitHub)
  external_repo_id text not null,          -- id de dépôt neutre (GitHub num / GitLab project id)
  repo_owner       text,
  repo_name        text,
  repo_full_name   text,
  default_branch   text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_project_git_links_connection
  on public.project_git_links(connection_id);

alter table public.project_git_links enable row level security;

-- Lecture = tout membre du projet (affichage de l'état de liaison dans les
-- settings). Écritures = service client, gate owner en TS (pattern integrations).
drop policy if exists project_git_links_select on public.project_git_links;
create policy project_git_links_select on public.project_git_links for select
  using (public.can_access_project(project_id));
