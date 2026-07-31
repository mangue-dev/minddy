-- minddy — MIN-144 : agir sur une PR en son propre nom.
--
-- Une écriture HUMAINE sur une pull request (approuver, commenter, répondre,
-- résoudre un fil, merger) doit porter le compte git de la personne, pas
-- `minddy-app[bot]`. Côté GitHub il n'existait aucun token utilisateur : tout
-- partait du token d'installation de l'App. Cette table porte le compte git que
-- CHAQUE membre a autorisé — le token *user-to-server* de l'App déjà installée.
--
-- Pourquoi PAS `git_connections` : sa ligne GitHub est indexée par
-- `installation_id` (unique global) et porte le `user_id` de QUI A INSTALLÉ,
-- pas de chaque membre. Une ligne GitHub sans installation_id y casserait
-- `findReusableConnection` / `listCandidateRepos`, qui en ont besoin pour lier
-- un dépôt. Les deux objets ne disent pas la même chose : « l'App est installée
-- sur ce compte » d'un côté, « voici MON compte git » de l'autre.
--
-- GitLab n'a AUCUNE ligne ici : sa connexion OAuth de `git_connections` EST déjà
-- l'identité de l'utilisateur (token du compte connecté, refresh single-use
-- rotatif). La dupliquer ferait diverger les deux rotations.
--
-- Aucune FK depuis `project_git_links` : une identité ne lie pas un dépôt, elle
-- ne fait qu'endosser des gestes.
--
-- RLS : lecture propriétaire uniquement ; toutes les écritures passent par le
-- service client avec vérification en TS (pattern git_connections / api_keys).
-- Idempotent — safe to re-run.

create table if not exists public.git_user_identities (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  -- 'github' | 'gitlab'. Pas de CHECK : lib/repo-providers.ts fait autorité.
  provider                text not null,
  provider_account_id     text,            -- id numérique du compte chez la forge
  account_login           text,            -- login affiché
  account_avatar_url      text,
  access_token_encrypted  text,            -- enveloppe AES-256-GCM (lib/server/encryption)
  -- NULLABLES tous les deux : une GitHub App sans « Expire user authorization
  -- tokens » ne renvoie ni `expires_in` ni `refresh_token`, et son token est
  -- permanent. Ce n'est PAS un état dégradé, c'est l'autre configuration valide.
  refresh_token_encrypted text,
  token_expires_at        timestamptz,
  oauth_scopes            text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Un seul compte git par (utilisateur, provider) : réautoriser remplace.
create unique index if not exists idx_git_user_identities_user_provider
  on public.git_user_identities(user_id, provider);
create index if not exists idx_git_user_identities_user
  on public.git_user_identities(user_id);

alter table public.git_user_identities enable row level security;

-- Lecture = le propriétaire uniquement (la section « Votre compte git »). Les
-- colonnes de tokens ne sont JAMAIS renvoyées par l'API (select de colonnes
-- explicites côté serveur). Écritures = service client seulement.
drop policy if exists git_user_identities_select on public.git_user_identities;
create policy git_user_identities_select on public.git_user_identities for select
  using (user_id = (select auth.uid()));
