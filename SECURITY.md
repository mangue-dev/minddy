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
- **Privilège admin (`/admin`, `/api/admin/*`) :** deux sources, et une seule
  porte — `isAdminUser` ([lib/server/admin.ts](lib/server/admin.ts)), appelée
  dans **chaque** handler exporté, jamais présumée d'un passage précédent.
  (1) `app_metadata.role === "admin"`, non écrivable par l'utilisateur ;
  (2) l'allowlist `ADMIN_EMAILS`, qui exige depuis MIN-344 que l'adresse soit
  **confirmée** — vérifié sur `auth.users.email_confirmed_at` en clé de service,
  jamais sur un claim (le `email_verified` de `user_metadata` est écrit par
  l'utilisateur lui-même, donc forgeable). Sans cette exigence, s'inscrire avec
  l'adresse d'un admin listé mais pas encore inscrit suffisait à obtenir le
  privilège le plus élevé du produit. Lecture fail-closed, mémorisée 60 s.
  `/api/me/admin` est purement informatif : il dit à la barre latérale s'il faut
  afficher l'entrée, il n'ouvre rien.
- **Un lien reçu n'ouvre pas de session (MIN-345).** Trois surfaces posaient une
  session sur une simple navigation `GET`, sans rien qui prouve que la personne
  ait demandé **ce** tour d'authentification — c'est la fixation de session :
  l'attaquant demande un lien pour son compte, l'envoie, et lit ensuite tout ce
  que sa victime y écrit. Chacune est traitée à sa mesure :
  - **Lien e-mail** (`/auth/callback?token_hash=…`) : le jeton n'est plus
    consommé sur la navigation. Il attend dans un cookie `httpOnly`
    `SameSite=Lax` ([lib/auth-otp-pending.ts](lib/auth-otp-pending.ts)) et la
    session ne naît que du `POST` de `/auth/confirm`. Pas de nonce dans le lien :
    le gabarit GoTrue compose l'URL, et un mail s'ouvre légitimement sur un autre
    appareil que celui qui l'a demandé (invitation, confirmation lue au
    téléphone).
  - **Tour OAuth** : inchangé, il était déjà lié à son initiateur — le
    vérificateur PKCE est un cookie posé au départ, et l'échange échoue sans lui.
  - **Deep link de bureau** (`minddy://auth`) : nonce tiré par l'app au départ du
    tour ([lib/desktop/auth-turn.ts](lib/desktop/auth-turn.ts)), rapporté par le
    lien, consommé au retour. Un lien que le système livre sans qu'on ait rien
    demandé est ignoré ; un jeton de mail, qui ne peut pas porter de nonce, se
    confirme à la main dans la fenêtre.
  - **SSO de board** (`/f/<token>/sso?jwt=…`) : plafond de durée de vie imposé
    **au vérificateur** (il ne vivait que dans notre signeur, que le client
    n'exécute pas) et jeton **à usage unique**, consommé en base
    ([lib/server/feedback/sso-replay.ts](lib/server/feedback/sso-replay.ts)).
- **Origine des écritures.** Les routes d'API s'authentifient par cookie, et un
  cookie part tout seul : une écriture qui **se déclare** d'une autre origine est
  refusée en 403, dans `getAuthedUser` — global, pour la même raison que le refus
  `aal2`. Une requête qui ne déclare **aucune** origine passe, à dessein : elle
  ne peut pas venir d'une page tierce (le navigateur aurait posé l'en-tête), et
  la refuser ferait tomber les appelants sans page (sondes, tests, CLI). Le
  raisonnement complet et les deux niveaux de garde sont dans
  [lib/server/same-origin.ts](lib/server/same-origin.ts). Deux surfaces sont plus
  strictes et **exigent** l'en-tête, parce qu'elles ne sont atteintes que par un
  formulaire de l'app : `/api/oauth/authorize` (consentement) et
  `/auth/confirm/complete` (ouverture de session).
- **Ré-authentification avant l'irréversible.** `DELETE /api/account` emporte en
  cascade les projets possédés, leurs tickets, leurs fichiers et l'accès de leurs
  membres : recopier son adresse protège de la maladresse, pas de quelqu'un
  d'autre. La route redemande donc le mot de passe — ou, pour un compte OAuth qui
  n'en a pas, une authentification datant de moins de 15 minutes, datée par le
  claim `amr` du JWT ([lib/server/reauth.ts](lib/server/reauth.ts)). La
  vérification du mot de passe est débitée par utilisateur, pour ne pas devenir
  un oracle entre les mains d'une session volée.
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
  [20260926091000_policy_tightening.sql](supabase/migrations/20260926091000_policy_tightening.sql),
  rejouée par [20261220090000_tenant_isolation.sql](supabase/migrations/20261220090000_tenant_isolation.sql)
  (MIN-338 : neuf policies écrites depuis étaient revenues sans clause `TO`).
- **`project_id` est gelé** sur toute table cloisonnée que la RLS laisse mettre à
  jour depuis le client. Un `with check` ne voit que la ligne NOUVELLE : il
  vérifie que la destination m'est accessible, pas que je n'ai pas déplacé la
  ligne. Un membre de deux projets pouvait donc sortir un ticket, un objectif ou
  une page de l'un — sans corbeille et sans trace. C'est un trigger
  `before update of project_id` (`public.freeze_project_id`), posé par une boucle
  sur le catalogue, qui refuse (MIN-338).
- **Binding d'auteur :** les inserts client exigent que l'auteur soit l'appelant
  — `created_by = auth.uid()` (`issues`, `issue_relations`), `author_id =
  auth.uid()` (`comments`). Pas d'usurpation d'auteur.
- **Pas de hard delete PostgREST** sur `issues`/`objectives`/`attachments`/`pages` :
  la suppression passe par la corbeille et le nettoyage storage côté serveur
  ([lib/server/trash.ts](lib/server/trash.ts), [lib/server/pages.ts](lib/server/pages.ts)).
  `pages_delete` avait rouvert cette porte — un DELETE direct emportait
  l'historique de la page et laissait ses fichiers orphelins (MIN-338).
- **Colonnes secrètes cloisonnées par privilèges colonne** (pas seulement par
  RLS, qui filtre les lignes et non les colonnes) : `git_connections`,
  `user_ai_keys`, `api_keys`, `oauth_grants`, `integrations`, `billing_accounts`
  — les tokens/hashs/identifiants Stripe ne sont pas dans la liste blanche
  lisible par `authenticated`. Voir
  [20260926090000_security_grants.sql](supabase/migrations/20260926090000_security_grants.sql).
  ⚠ Conséquence : une colonne AJOUTÉE plus tard à l'une de ces tables n'est pas
  lisible tant qu'un `grant select (col)` explicite ne l'ajoute pas.
- **Fonctions SECURITY DEFINER :** réservées au `service_role`, sauf les aides de
  policy (`can_access_project`, `is_project_member`, `is_project_owner`, et la
  famille `can_watch_*`) — elles ne répondent que sur
  l'accès de l'appelant, et les policies RLS ne peuvent pas les appeler sans
  EXECUTE. La règle est appliquée par une boucle sur `pg_proc`
  ([20260926093000_definer_grants_sweep.sql](supabase/migrations/20260926093000_definer_grants_sweep.sql)),
  pas fonction par fonction.
  ⚠ **Piège Supabase :** `revoke … from public` NE SUFFIT PAS. Le bootstrap pose
  `alter default privileges … grant all on functions to anon, authenticated`,
  donc chaque fonction naît avec un EXECUTE **explicite** pour ces deux rôles ;
  seul `revoke … from public, anon, authenticated` les retire. Neuf fonctions du
  repo (dashboard admin, coûts IA, usage, `claim_agent_run`) étaient de fait
  appelables sans aucune session avec la seule clé anon publique. Le piège a
  resservi : `get_ai_run_spend` (20261118090000) a été écrite avec cette forme-là
  et laissée ouverte jusqu'à MIN-338 — d'où le balai rejoué, et le garde-fou
  (§10) qui refuse désormais la forme insuffisante à l'écriture.

## 3. Chiffrement

- **Au repos :** Supabase chiffre la base (AES-256) et le stockage via son
  infrastructure. `auth.users` (email, métadonnées) est géré et chiffré par
  Supabase.
- **Secrets applicatifs :** les vrais secrets sont chiffrés **côté app** en
  AES-256-GCM (enveloppe) avant écriture, jamais renvoyés par l'API :
  - tokens OAuth GitLab → `GIT_TOKEN_ENCRYPTION_SECRET` /
    `GITLAB_TOKEN_ENCRYPTION_SECRET`
  - **secret de webhook GitLab, un par dépôt** (MIN-333) → même enveloppe et
    même secret de dérivation que les tokens ci-dessus, rangé dans
    `project_git_links.webhook_secret_encrypted`. Par dépôt et pas global :
    GitLab affiche le token d'un hook à qui peut l'éditer, donc un secret unique
    écrit chez chaque locataire laissait tout mainteneur d'un dépôt lié forger
    des événements pour les dépôts des autres.
  - clés IA « BYOK » → `AI_KEY_ENCRYPTION_SECRET`
  - secrets SSO des boards de feedback → `FEEDBACK_SSO_ENCRYPTION_SECRET`
    (MIN-119). Chiffrés et non hachés parce qu'ils sont **partagés** avec le
    backend de l'éditeur, qui doit pouvoir les relire ; qui les détient peut
    forger l'identité de n'importe quel visiteur du board.
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
| Webhook GitHub | Signature HMAC de l'App (`timingSafeEqual`) ; **fail-closed** — secret absent → 503, rien traité ; anti-rejeu sur `X-GitHub-Delivery` |
| Webhook GitLab | Jeton **propre au dépôt**, résolu sur `project.id` puis comparé en `timingSafeEqual` ; **fail-closed** — aucune matière à vérifier → 503, jeton refusé → 401 ; anti-rejeu sur `X-Gitlab-Event-UUID` |
| Webhook Stripe | Signature Stripe vérifiée ; idempotence en **deux temps** (MIN-344) — la ligne `stripe_webhook_events` est une réservation, le `processed_at` n'est posé qu'après un traitement réussi, donc un échec transitoire reste rejouable |
| Webhook Supabase (nouvel utilisateur) | Secret partagé `x-minddy-webhook-secret` ; fail-closed 503 |
| OAuth 2.1 / MCP (`/api/oauth/*`, `/api/mcp`) | Clients publics PKCE S256 obligatoire, tokens opaques hashés, codes à usage unique |
| Boards publics (`/f/<token>`, `/share/<token>`) | Servis côté serveur en clé service ; option mot de passe ; OTP email pour voter/commenter |
| API intégration (`/api/v1/*`) | Clé API d'intégration (sha256), scopée au projet |

## 9. L'agent de code — ce que sa microVM détient

La microVM d'un run (Vercel Sandbox) exécute du shell décidé par un modèle, avec
un réseau sortant ouvert. On la considère **compromise par hypothèse** : la
question n'est pas de l'empêcher de mal faire, c'est de borner ce qu'elle tient.

- **Aucun secret de minddy.** Ni clé LLM (le firewall pose l'en-tête
  `authorization` *après* la sortie de la VM), ni clé Supabase, ni jeton
  d'identité : le plan de contrôle reconnaît la VM par l'OIDC que la plateforme
  signe, et le locataire (`team_id`/`project_id`) est vérifié avant le nom
  (MIN-331). Voir [lib/server/agent/network-policy.ts](lib/server/agent/network-policy.ts).
- **Un seul secret, et il est structurel : le token de forge.** `git clone`
  l'écrit dans `.git/config` — c'est ce avec quoi la VM clone et pousse, elle ne
  peut pas travailler sans. Ce qui est borné, c'est ce qu'il ouvre
  ([lib/server/agent/repo-access.ts](lib/server/agent/repo-access.ts),
  `RepoTokenAccess`) :

  | Qui le détient | Portée | Pouvoir |
  | --- | --- | --- |
  | Nos routes (PR, review, merge, issues) | le dépôt lié | permissions de l'installation |
  | microVM d'un run de ticket / carnet | le dépôt lié | `contents: write` (clone + push) |
  | microVM d'une **relecture** de pull request | le dépôt lié | `contents: read` |

  La relecture est le seul ancrage dont le contenu vient d'un **fork inconnu** :
  elle n'écrit rien dans le dépôt, et `/repo-auth` lui **refuse** tout token
  frais. Avant MIN-327, le token minté n'était scopé à rien — il valait sur tous
  les dépôts de l'installation — et une relecture en recevait un en écriture.
- **⚠ GitLab n'a pas cette gradation.** Le token remis est l'access token OAuth
  de la connexion, de portée `api` sur le compte entier : GitLab ne sait pas
  down-scoper un token OAuth à l'usage, et son seul mécanisme à portée réduite
  (project access token) est un jeton persistant d'au moins un jour. Une
  relecture GitLab tourne donc avec un token qui peut écrire. Contrainte de la
  plateforme, assumée et dite — comme l'absence d'identité de bot (MIN-146).
- **Le token ne remonte pas dans les journaux.** La substitution de
  [lib/server/agent/redact.ts](lib/server/agent/redact.ts) le retire de tout ce
  qui sort de la boucle (sortie de tool, message d'erreur, checkpoint) *avant* le
  modèle : `git remote -v` et `cat .git/config` rendent `[redacted]`.
- **Ce qui reste possible**, et qui est borné ailleurs : exfiltrer le **contenu**
  du dépôt (réseau ouvert, assumé — une liste blanche casserait `npm install`
  chez nos utilisateurs), et dépenser hors ledger sur la route LLM créditée
  (bornée par la clé par run à plafond dur, tenue par le fournisseur).

## 10. Outillage

- **CI GitHub** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) : tests,
  typecheck et audit sur chaque pull request et chaque push, dans un runner
  jetable **sans aucun secret** (déclencheur `pull_request`, jamais
  `pull_request_target` ; `permissions: contents: read`). C'est ce qui permet
  d'ouvrir le dépôt aux contributions : avant MIN-335, `deploy.sh` était le seul
  pipeline, donc le code d'une PR ne pouvait être vérifié qu'en l'exécutant sur
  le poste du mainteneur, à côté du `.env` de production. Le dépôt exécute du
  code au premier `install` et au premier `vitest` — c'est dit dans
  [CONTRIBUTING.md](CONTRIBUTING.md).
- **Gate de vulnérabilités** ([scripts/audit.mjs](scripts/audit.mjs)) : seuil
  high/critical sur les **trois** lockfiles (`pnpm-lock.yaml` — celui qui
  installe réellement —, `package-lock.json`, `desktop/package-lock.json`),
  **arbre entier**. `--omit=dev` a été retiré : `esbuild` produit les bundles
  livrés et `tailwindcss` le CSS servi, sans être des `dependencies`.
- **Pipeline de deploy** ([deploy.sh](deploy.sh)) : rejoue ces mêmes gates, plus
  le verdict de la CI pour le commit déployé. Dernier filet, pas source de
  vérité.
- **Sonde anti cross-tenant** ([scripts/security-probe.mjs](scripts/security-probe.mjs)) :
  vérifie EN VRAI contre la prod que RLS + grants refusent les accès croisés
  (lecture/écriture d'un projet étranger, RPC definer, colonnes secrètes,
  upload hors préfixe, listing de bucket, déplacement d'une ligne vers son
  propre projet, hard delete d'une page). **Exécution manuelle** (touche la
  prod) — hors du `include` de vitest.
- **Garde-fou des migrations** ([lib/schema-guardrails.test.ts](lib/schema-guardrails.test.ts)),
  lui dans la suite : il relit les migrations écrites depuis le dernier balai et
  échoue si l'une crée une policy sans clause `TO`, une table sans RLS, une
  definer qui ne se referme pas sur `anon`/`authenticated`, ou une policy UPDATE
  sur une table cloisonnée sans le gel de `project_id`. C'est la réponse à ce qui
  a produit MIN-338 : quatre régressions écrites de bonne foi, chacune juste
  prise seule, par des gens qui n'avaient aucune raison d'ouvrir le fichier où la
  règle était écrite.

## 11. Procédure d'incident (courte)

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
