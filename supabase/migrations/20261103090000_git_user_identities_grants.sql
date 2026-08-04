-- minddy — la 7e table à colonnes secrètes, oubliée du verrouillage MIN-118.
--
-- `20260926090000_security_grants.sql` a fermé le trou sur SIX tables : une
-- policy de lecture propriétaire filtre les LIGNES, jamais les COLONNES, et
-- tout utilisateur connecté détient la clé anon publique + son JWT et peut
-- parler à PostgREST en direct — donc `?select=access_token_encrypted` passait.
--
-- `git_user_identities` (20260924090000, MIN-144) est arrivée DEUX JOURS avant
-- ce verrouillage, avec exactement la même policy et exactement le même
-- raisonnement dans son commentaire (« les colonnes de tokens ne sont JAMAIS
-- renvoyées par l'API ») — vrai de nos routes, faux de PostgREST. Elle porte
-- pourtant les deux mêmes colonnes que `git_connections` :
-- `access_token_encrypted` et `refresh_token_encrypted`, le token
-- *user-to-server* de la GitHub App sous lequel partent les gestes humains sur
-- une pull request.
--
-- Ce qui fuyait : l'enveloppe AES-256-GCM de SON PROPRE token (la policy ne
-- rend que sa ligne). Pas le token en clair — la clé est
-- `GIT_TOKEN_ENCRYPTION_SECRET`, côté serveur. C'est donc du secret par défaut
-- qu'on rétablit, pas une compromission qu'on répare : un chiffré n'a rien à
-- faire dans une réponse PostgREST, et le jour où la clé bouge ou fuit, les
-- copies déjà exfiltrées, elles, ne bougent pas.
--
-- Aucun consommateur applicatif à casser : les six lectures de cette table
-- passent toutes par le service client (`lib/server/git/user-identities.ts`,
-- `lib/server/agent/pr-activity.ts`, `lib/server/account-export.ts`), et
-- `PUBLIC_COLS` ne cite déjà que les colonnes de la liste blanche ci-dessous.
--
-- ⚠ Même effet de bord voulu que sur les six autres : une colonne AJOUTÉE plus
-- tard à cette table ne sera PAS lisible par `authenticated` tant qu'un
-- `grant select (col)` explicite ne l'ajoute pas ici.
--
-- Idempotent — safe to re-run.

-- git_user_identities — cachées : access_token_encrypted, refresh_token_encrypted.
revoke select on table public.git_user_identities from anon, authenticated;
grant select (
  id, user_id, provider, provider_account_id,
  account_login, account_avatar_url,
  token_expires_at, oauth_scopes, created_at, updated_at
) on public.git_user_identities to authenticated;
