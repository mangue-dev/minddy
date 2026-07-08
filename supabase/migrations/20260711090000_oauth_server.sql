-- minddy — Serveur d'autorisation OAuth 2.1 pour le endpoint MCP.
-- Clients publics uniquement (PKCE S256 obligatoire), tokens opaques hashés
-- (sha256 hex, pattern api_keys), révocation instantanée. Chaque grant
-- (user × client) est adossé à une ligne api_keys « acteur » (jamais
-- utilisable comme clé : key_hash = sha256 d'un secret jamais révélé) pour
-- que l'attribution timeline existante (api_key_id sur issue_events et
-- comments → « Claude (mcp) » + logo) fonctionne sans changement.
-- Idempotent — safe to re-run.

-- Clients enregistrés dynamiquement (RFC 7591). client_id public, préfixé
-- « mdyc_ » pour la lisibilité des logs — jamais secret, pas de hash.
create table if not exists public.oauth_clients (
  client_id     text primary key,                 -- "mdyc_" + 12 octets base64url
  client_name   text not null,
  redirect_uris text[] not null,
  logo_uri      text,
  client_uri    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
alter table public.oauth_clients enable row level security;
-- Aucune policy : lectures/écritures via le service client uniquement.

-- Un grant par (user × client) actif : les hashes access/refresh sont
-- rotationnés SUR PLACE (une ligne = une « application connectée » dans les
-- settings). prev_refresh_token_hash garde la génération N-1 pour détecter
-- un rejeu de refresh token (⇒ révocation du grant entier).
create table if not exists public.oauth_grants (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users(id) on delete cascade,
  client_id                 text not null references public.oauth_clients(client_id) on delete cascade,
  api_key_id                uuid not null references public.api_keys(id) on delete cascade,
  scope                     text not null default 'minddy',
  access_token_hash         text,               -- sha256 hex de "mdyat_…"
  access_token_expires_at   timestamptz,
  refresh_token_hash        text,               -- sha256 hex de "mdyrt_…"
  refresh_token_expires_at  timestamptz,        -- fenêtre glissante ~90 j
  prev_refresh_token_hash   text,               -- détection de rejeu (rotation N-1)
  created_at                timestamptz not null default now(),
  last_used_at              timestamptz,
  revoked_at                timestamptz
);
create unique index if not exists idx_oauth_grants_access_hash
  on public.oauth_grants(access_token_hash) where access_token_hash is not null;
create unique index if not exists idx_oauth_grants_refresh_hash
  on public.oauth_grants(refresh_token_hash) where refresh_token_hash is not null;
create index if not exists idx_oauth_grants_prev_refresh_hash
  on public.oauth_grants(prev_refresh_token_hash) where prev_refresh_token_hash is not null;
create unique index if not exists idx_oauth_grants_user_client_active
  on public.oauth_grants(user_id, client_id) where revoked_at is null;
create index if not exists idx_oauth_grants_user on public.oauth_grants(user_id);
alter table public.oauth_grants enable row level security;
-- Lecture = propriétaire (liste des settings, parité api_keys) ; toutes les
-- écritures passent par le service client.
drop policy if exists oauth_grants_select on public.oauth_grants;
create policy oauth_grants_select on public.oauth_grants for select
  using (user_id = (select auth.uid()));

-- Codes d'autorisation à usage unique (10 min). Un code rejoué révèle une
-- interception potentielle : le grant lié est révoqué (RFC 6749 §4.1.2).
create table if not exists public.oauth_authorization_codes (
  code_hash             text primary key,       -- sha256 hex de "mdyac_…"
  client_id             text not null references public.oauth_clients(client_id) on delete cascade,
  user_id               uuid not null references auth.users(id) on delete cascade,
  grant_id              uuid not null references public.oauth_grants(id) on delete cascade,
  redirect_uri          text not null,
  code_challenge        text not null,
  code_challenge_method text not null default 'S256' check (code_challenge_method = 'S256'),
  scope                 text not null default 'minddy',
  resource              text,
  created_at            timestamptz not null default now(),
  expires_at            timestamptz not null,
  used_at               timestamptz
);
create index if not exists idx_oauth_codes_expires on public.oauth_authorization_codes(expires_at);
alter table public.oauth_authorization_codes enable row level security;
-- Aucune policy : service-only.

-- Marqueur des lignes api_keys « acteurs OAuth » : masquées de la liste
-- Clés API des settings, révoquées avec leur grant.
alter table public.api_keys
  add column if not exists oauth_client_id text references public.oauth_clients(client_id) on delete set null;
