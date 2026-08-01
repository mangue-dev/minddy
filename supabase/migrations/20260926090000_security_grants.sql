-- minddy — MIN-118 : verrouillage des grants (RPC definer + colonnes secrètes).
--
-- Deux trous fermés ici :
--
--  1. `reconcile_objective_status(uuid)` est SECURITY DEFINER et était resté
--     exécutable par `anon`/`authenticated` via POST /rest/v1/rpc/… — write
--     cross-tenant sur n'importe quel objectif. Seul definer du repo sans la
--     paire revoke/grant (pattern claim_agent_run, 20260806090000).
--
--  2. Les 6 tables à colonnes secrètes ont une policy de lecture propriétaire
--     (« l'API ne renvoie jamais les tokens » — vrai pour NOS routes, mais
--     tout utilisateur connecté détient la clé anon + son JWT et peut parler
--     à PostgREST en direct : `?select=access_token_encrypted` passait). La
--     policy RLS filtre les LIGNES, pas les colonnes ; le filtre colonne se
--     fait par privilèges. Piège Postgres : ils sont ADDITIFS — le grant
--     table-level par défaut de Supabase couvre toute la table, il faut donc
--     revoke PUIS re-granter la liste blanche.
--
-- Toutes les écritures app passent par le service client (aucune route ne lit
-- ces tables via le client RLS — vérifié au grep), donc la liste blanche ne
-- change rien au comportement : elle fige ce que PostgREST peut révéler.
--
-- ⚠ Effet de bord voulu : une colonne AJOUTÉE plus tard à l'une de ces tables
-- ne sera PAS lisible par `authenticated` tant qu'un `grant select (col)`
-- explicite ne l'ajoute pas à la liste. C'est le comportement recherché
-- (secret par défaut) — y penser dans la migration qui ajoute la colonne.
--
-- Idempotent — safe to re-run.

-- ── 1. RPC SECURITY DEFINER ─────────────────────────────────────────────────
revoke all on function public.reconcile_objective_status(uuid)
  from public, anon, authenticated;
grant execute on function public.reconcile_objective_status(uuid)
  to service_role;

-- ── 2. Colonnes secrètes : revoke table-level, re-grant liste blanche ───────

-- git_connections — cachées : access_token_encrypted, refresh_token_encrypted.
revoke select on table public.git_connections from anon, authenticated;
grant select (
  id, user_id, provider, installation_id, provider_account_id,
  account_login, account_type, repository_selection,
  token_expires_at, oauth_scopes, created_at, updated_at
) on public.git_connections to authenticated;

-- user_ai_keys — cachée : key_encrypted.
revoke select on table public.user_ai_keys from anon, authenticated;
grant select (
  id, user_id, provider, key_prefix, base_url,
  created_at, updated_at, last_used_at
) on public.user_ai_keys to authenticated;

-- api_keys — cachée : key_hash (sha256 de la clé complète).
revoke select on table public.api_keys from anon, authenticated;
grant select (
  id, user_id, name, key_prefix, agent, oauth_client_id,
  created_at, last_used_at, revoked_at
) on public.api_keys to authenticated;

-- oauth_grants — cachés : access_token_hash, refresh_token_hash,
-- prev_refresh_token_hash (rejouables en cas de fuite + collision de hash).
revoke select on table public.oauth_grants from anon, authenticated;
grant select (
  id, user_id, client_id, api_key_id, scope,
  access_token_expires_at, refresh_token_expires_at,
  created_at, last_used_at, revoked_at
) on public.oauth_grants to authenticated;

-- integrations — cachée : key_hash. Contrairement aux autres hashes, celui-ci
-- est aussi le SECRET HMAC des webhooks sortants (20260707230000) : le lire,
-- c'est pouvoir forger des payloads signés.
revoke select on table public.integrations from anon, authenticated;
grant select (
  id, project_id, name, key_prefix, kind, created_by,
  webhook_url, webhook_events, webhook_scope,
  webhook_last_status, webhook_last_at,
  created_at, last_used_at, revoked_at
) on public.integrations to authenticated;

-- billing_accounts — cachés : identifiants Stripe (customer/subscription/
-- checkout/price/event) et la note d'override admin. On laisse le « quel plan,
-- quel statut, quelle période » — ce que la page billing affiche.
revoke select on table public.billing_accounts from anon, authenticated;
grant select (
  user_id, email, admin_override_plan_id, stripe_plan_id,
  stripe_subscription_status, stripe_current_period_start,
  stripe_current_period_end, stripe_cancel_at_period_end,
  created_at, updated_at
) on public.billing_accounts to authenticated;
