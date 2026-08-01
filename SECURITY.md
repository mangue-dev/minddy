# Sécurité — minddy

Ce document décrit l'architecture de sécurité de minddy : comment
l'authentification, l'autorisation, le chiffrement et les surfaces publiques
sont conçus, et quoi faire en cas d'incident. Il complète les décisions
consignées au fil de l'eau dans les migrations et le code — il ne les remplace
pas.

**Stack :** Next.js (App Router) + Supabase (PostgreSQL, Auth, Storage), déployé
sur Vercel (HTTPS natif, redirection HTTP→HTTPS gérée par la plateforme).

---

## 1. Authentification

- **Fournisseur :** Supabase Auth (GoTrue). Email/mot de passe, magic link, et
  OAuth Google/GitHub. La configuration OAuth et SMTP vit dans le Dashboard
  Supabase ; sa trace versionnée est dans [.env.example](.env.example).
- **Vérification du JWT :** les route handlers résolvent l'utilisateur via
  `getClaims()` et non `getUser()` ([lib/server/api-auth.ts](lib/server/api-auth.ts)).
  Avec les clés de signature **asymétriques** (ES256) en place, la vérification
  est **locale** (WebCrypto + JWKS mis en cache) — aucun aller-retour réseau vers
  GoTrue par requête.
- **Durée de vie :** access token court (1 h), refresh token en rotation. Une
  instance Supabase injoignable est traitée en 503, jamais déguisée en 401
  (« déconnexion »).
- **Second facteur (MFA / TOTP) :** enrôlement TOTP + codes de récupération
  déjà en place. Le refus `aal2` est **global** et vit dans `getAuthedUser` : un
  compte qui a enrôlé un facteur n'est servi qu'en `aal2`. Ce choix évite la
  faille classique de la liste de routes sensibles qu'on oublie de compléter.
  Seule `/api/account/mfa/recover` passe `allowAal1` (le cas « plus de
  téléphone »).
- **Politique de mot de passe :** longueur minimale 8, imposée côté client
  ([app/(auth)/login/page.tsx](<app/(auth)/login/page.tsx>)) ET côté serveur
  (Dashboard Supabase → Auth). Voir le bloc « Durcissement Auth » de
  [.env.example](.env.example) pour la protection anti-mots-de-passe-fuités et
  les rate limits Auth.

## 2. Autorisation — un monolithe service-role, RLS en seconde ligne

Le modèle réel du code : la plupart des écritures passent par le **service
client** (`getServiceClient()`), et l'autorisation vit en **TypeScript**
(`getProjectAccess`, `requireProjectMember`, `is_project_owner`). C'est la
première ligne de défense, testée et explicite.

**RLS est la seconde ligne**, pas un ornement : tout utilisateur connecté détient
la clé anon publique + son JWT et peut parler à PostgREST (`/rest/v1/…`) en
direct. RLS est ce qui l'empêche de lire ou écrire les données d'un autre tenant
par ce chemin.

- **RLS activé sur toutes les tables `public`.** Certaines tables sont
  **deny-all volontaires** (RLS activé, aucune policy) : tout leur accès passe
  par le service client (ex. `oauth_clients`, journaux d'événements, tables de
  billing techniques). C'est intentionnel — ne pas « corriger » en ajoutant une
  policy sans en comprendre le consommateur.
- **Least privilege :** les policies de lecture/écriture s'appuient sur
  `auth.uid()` et `can_access_project()`. Depuis MIN-118, toute policy vise
  explicitement le rôle `authenticated` (plus aucune sur le rôle `public`, qui
  aurait inclus `anon`) — garde structurelle documentée dans
  [20260926091000_policy_tightening.sql](supabase/migrations/20260926091000_policy_tightening.sql).
- **Binding d'auteur :** les inserts client exigent que l'auteur soit l'appelant
  — `created_by = auth.uid()` (`issues`, `issue_relations`), `author_id =
  auth.uid()` (`comments`). Pas d'usurpation d'auteur.
- **Pas de hard delete PostgREST** sur `issues`/`objectives`/`attachments` : la
  suppression passe par la corbeille et le nettoyage storage côté serveur
  ([lib/server/trash.ts](lib/server/trash.ts)).
- **Colonnes secrètes cloisonnées par privilèges colonne** (pas seulement par
  RLS, qui filtre les lignes et non les colonnes) : `git_connections`,
  `user_ai_keys`, `api_keys`, `oauth_grants`, `integrations`, `billing_accounts`
  — les tokens/hashs/identifiants Stripe ne sont pas dans la liste blanche
  lisible par `authenticated`. Voir
  [20260926090000_security_grants.sql](supabase/migrations/20260926090000_security_grants.sql).
  ⚠ Conséquence : une colonne AJOUTÉE plus tard à l'une de ces tables n'est pas
  lisible tant qu'un `grant select (col)` explicite ne l'ajoute pas.
- **Fonctions SECURITY DEFINER :** réservées au `service_role`, sauf les cinq
  aides de policy (`can_access_project`, `is_project_member`, `is_project_owner`,
  `can_watch_agent_run`, `can_watch_numo_comment`) — elles ne répondent que sur
  l'accès de l'appelant, et les policies RLS ne peuvent pas les appeler sans
  EXECUTE. La règle est appliquée par une boucle sur `pg_proc`
  ([20260926093000_definer_grants_sweep.sql](supabase/migrations/20260926093000_definer_grants_sweep.sql)),
  pas fonction par fonction.
  ⚠ **Piège Supabase :** `revoke … from public` NE SUFFIT PAS. Le bootstrap pose
  `alter default privileges … grant all on functions to anon, authenticated`,
  donc chaque fonction naît avec un EXECUTE **explicite** pour ces deux rôles ;
  seul `revoke … from public, anon, authenticated` les retire. Neuf fonctions du
  repo (dashboard admin, coûts IA, usage, `claim_agent_run`) étaient de fait
  appelables sans aucune session avec la seule clé anon publique.

## 3. Chiffrement

- **Au repos :** Supabase chiffre la base (AES-256) et le stockage via son
  infrastructure. `auth.users` (email, métadonnées) est géré et chiffré par
  Supabase.
- **Secrets applicatifs :** les vrais secrets sont chiffrés **côté app** en
  AES-256-GCM (enveloppe) avant écriture, jamais renvoyés par l'API :
  - tokens OAuth GitLab → `GIT_TOKEN_ENCRYPTION_SECRET` /
    `GITLAB_TOKEN_ENCRYPTION_SECRET`
  - clés IA « BYOK » → `AI_KEY_ENCRYPTION_SECRET`
  - clés API / grants OAuth → stockés en **sha256** (jamais réversibles).
- **Pas de pgcrypto colonne :** inutile ici — les secrets sont déjà chiffrés
  côté app, et email/nom vivent dans `auth.users` (chiffré par Supabase).

## 4. Transport & headers

Définis dans [next.config.mjs](next.config.mjs), sur toutes les routes :

| Header | Valeur |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(self), geolocation=()` |
| `Content-Security-Policy` | `frame-ancestors 'none'; base-uri 'self'; form-action 'self'` |

- `preload` est dans le header mais le domaine **n'est pas soumis** à
  hstspreload.org (quasi irréversible pour tout le domaine).
- **Une seule exception :** `/oauth/authorize` (l'écran de consentement) sert la
  même CSP **sans `form-action`**. Son formulaire POSTe vers
  `/api/oauth/authorize`, qui répond 303 vers le `redirect_uri` du client MCP —
  cross-origin par construction. Chrome et Safari appliquent `form-action` à la
  cible de la redirection qui suit un POST de formulaire (Firefox non) :
  `form-action 'self'` y bloquerait tout le flux OAuth du MCP.
- La CSP se limite à `frame-ancestors`/`base-uri`/`form-action`. Une CSP à
  `script-src` strict (nonces) exigerait de réécrire la chaîne de rendu (scripts
  inline Next + theme-init-script) — **chantier séparé** si souhaité.
- Micro autorisé en `self` : la dictée de l'assistant s'en sert.

## 5. Fichiers (Supabase Storage)

- **Buckets privés** (`attachments`) : lecture par URLs signées mintées en clé
  service ; upload gaté par le préfixe de chemin
  (`projects/{project_id}/…` → membre du projet, `chat/{user_id}/…` → soi-même).
- **Buckets publics** (`project-icons`) : lecture via `/object/public/…` ;
  aucune policy de **listing** (l'énumération anon a été retirée, MIN-118).
- **Limites de taille** posées sur les buckets (`file_size_limit`) — la seule
  borne que le client direct-to-storage ne peut pas contourner :
  `attachments` = 20 Mo, `project-icons` = 25 Mo. Voir
  [20260926092000_storage_limits.sql](supabase/migrations/20260926092000_storage_limits.sql).
- Le bucket public `avatars` (orphelin) est retiré via
  [scripts/drop-avatars-bucket.mjs](scripts/drop-avatars-bucket.mjs).

## 6. Validation des entrées

- Validation **manuelle** (pas de Zod) sur les route handlers : chaque string
  bornée en longueur, chaque enum passée par une allowlist
  ([lib/issue-validation.ts](lib/issue-validation.ts),
  [lib/objective-constants.ts](lib/objective-constants.ts),
  [lib/category-colors.ts](lib/category-colors.ts)), chaque nombre fini et borné,
  chaque array plafonné. Un corps JSON malformé produit un 400, jamais un crash.
- **Injection SQL :** Supabase/PostgREST paramétrise ; aucune requête raw
  concaténée.
- **XSS :** le markdown (commentaires, descriptions) est rendu sans HTML brut
  (react-markdown sans `rehype-raw`, TipTap `html: false`) ; les posts du board
  de feedback sont en texte brut.

## 7. Rate limiting

- Rate limiter **in-memory** par utilisateur+route
  ([lib/server/session-rate-limit.ts](lib/server/session-rate-limit.ts)) sur les
  routes coûteuses (dictée, assistant, imports, créations, commentaires…).
- **Limite connue :** in-memory = **par instance** (se réinitialise au deploy,
  ne se partage pas entre régions/instances Fluid). Acceptable sans utilisateurs.
  **Critère de passage à Upstash Redis :** abus constaté, ou besoin d'un plafond
  strict cross-instance. Non déployé tant que ce critère n'est pas atteint.
- **Login / signup / reset / OTP** parlent à GoTrue **en direct** depuis le
  navigateur : nos routes ne les voient pas. Leur rate limit est réglé côté
  **Dashboard Supabase** (voir [.env.example](.env.example)).

## 8. Surfaces publiques et leurs protections

| Surface | Protection |
| --- | --- |
| Crons (`/api/cron/*`) | `Authorization: Bearer ${CRON_SECRET}`, comparé en `timingSafeEqual` ([lib/server/cron-auth.ts](lib/server/cron-auth.ts)) |
| Webhooks GitHub/GitLab | Signature HMAC (`timingSafeEqual`) ; **fail-closed** — secret absent → 503, rien traité |
| Webhook Stripe | Signature Stripe vérifiée |
| Webhook Supabase (nouvel utilisateur) | Secret partagé `x-minddy-webhook-secret` ; fail-closed 503 |
| OAuth 2.1 / MCP (`/api/oauth/*`, `/api/mcp`) | Clients publics PKCE S256 obligatoire, tokens opaques hashés, codes à usage unique |
| Boards publics (`/f/<token>`, `/share/<token>`) | Servis côté serveur en clé service ; option mot de passe ; OTP email pour voter/commenter |
| API intégration (`/api/v1/*`) | Clé API d'intégration (sha256), scopée au projet |

## 9. Outillage

- **Pipeline de deploy** ([deploy.sh](deploy.sh)) : `npm run test` +
  `npm audit --omit=dev --audit-level=high` + `npm run typecheck` avant tout
  push. Une vuln high/critical bloque le deploy. (Pas de CI GitHub — ce script
  EST le pipeline.)
- **Sonde anti cross-tenant** ([scripts/security-probe.mjs](scripts/security-probe.mjs)) :
  vérifie EN VRAI contre la prod que RLS + grants refusent les accès croisés
  (lecture/écriture d'un projet étranger, RPC definer, colonnes secrètes,
  upload hors préfixe, listing de bucket). **Exécution manuelle** (touche la
  prod) — hors du `include` de vitest.

## 10. Procédure d'incident (courte)

En cas de compromission suspectée :

1. **Révoquer les clés exposées.** Faire tourner dans le Dashboard Supabase :
   `SUPABASE_SERVICE_ROLE_KEY`, clé anon si nécessaire. Faire tourner les
   secrets d'env sur Vercel (`*_ENCRYPTION_SECRET`, `CRON_SECRET`,
   `*_WEBHOOK_SECRET`, `OPENROUTER_API_KEY`, clés Stripe). Redéployer.
2. **Purger les sessions.** Dashboard Supabase → Auth → déconnecter tous les
   utilisateurs (invalide les refresh tokens). Le passage aux clés de signature
   asymétriques n'invalide pas les access tokens en cours — la purge des
   sessions + leur expiration 1 h ferme la fenêtre.
3. **Révoquer les grants OAuth / clés API** compromis
   (`oauth_grants.revoked_at`, `api_keys.revoked_at`, `integrations.revoked_at`).
4. **Constater l'étendue.** Journaux Vercel + Supabase, table
   `stripe_webhook_events` et journaux d'activité (`issue_events`) pour tracer
   les actions.
5. **Rejouer la sonde** ([scripts/security-probe.mjs](scripts/security-probe.mjs))
   après remédiation.

**Contact :** l'équipe minddy (le propriétaire du projet Supabase/Vercel).
