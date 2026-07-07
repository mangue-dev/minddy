-- minddy — Clés API personnelles (endpoint MCP)
-- Une clé nommée, scopée à un UTILISATEUR (pas à un projet) : l'agent MCP
-- agit comme cet utilisateur sur tous ses projets accessibles
-- (getProjectAccess). Révocation soft (revoked_at) ; seul le sha256 hex de la
-- clé est stocké, le plaintext n'est montré qu'une fois à la création
-- (pattern integrations). Préfixe "mdyk_" — distinct du "mdy_" des clés
-- d'intégration pour qu'un collage au mauvais endroit échoue clairement.
-- Idempotent — safe to re-run.

create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  key_hash     text not null,          -- sha256 hex de la clé complète
  key_prefix   text not null,          -- ex. "mdyk_Ab12Cd" pour affichage
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create unique index if not exists idx_api_keys_key_hash on public.api_keys(key_hash);
create index if not exists idx_api_keys_user on public.api_keys(user_id);

alter table public.api_keys enable row level security;

-- Lecture = le propriétaire uniquement (liste des settings du compte).
-- Toutes les écritures passent par le service client (routes
-- /api/account/api-keys) — aucune policy d'écriture, pattern integrations.
drop policy if exists api_keys_select on public.api_keys;
create policy api_keys_select on public.api_keys for select
  using (user_id = (select auth.uid()));

-- Attribution : les actions déclenchées via MCP restent attribuées à
-- l'utilisateur (actor_id/author_id = le propriétaire de la clé), avec un
-- marqueur via_mcp pour que la timeline affiche « X (via agent) » — miroir
-- exact de via_assistant (migration 20260707170000).
alter table public.issue_events
  add column if not exists via_mcp boolean not null default false;

alter table public.comments
  add column if not exists via_mcp boolean not null default false;
