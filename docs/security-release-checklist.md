# Checklist de sécurité avant mise en production

**Version : 1.0 — propriétaire : équipe technique minddy**

Cette checklist est une barrière obligatoire avant toute promotion de Minddy
Cloud. Une release du cœur passe déjà par cette promotion et réutilise donc la
même preuve. Elle complète la CI, la revue de code et les audits périodiques ;
elle ne remplace jamais un pentest lorsque le risque du lancement l'exige.

## Mode d'exécution

1. Déterminer le SHA candidat. Pour une release du cœur, lancer `npm run deploy`
   et le laisser préparer le commit de version ; pour un déploiement web seul,
   utiliser le `HEAD` propre affiché par le script. Le déploiement affiche le SHA
   exact avant de demander la revue. Depuis ce SHA, copier le
   [modèle de compte rendu](#modèle-de-compte-rendu) dans une issue privée ou
   dans `mangue-dev/minddy-cloud-ops`. Ne jamais y coller de secret, token,
   donnée personnelle réelle ou détail facilitant une exploitation. La
   référence stable de ce compte rendu sera demandée par le déploiement.
2. Lister le diff depuis `production`, ses migrations et ses endpoints
   sensibles. Exécuter tous les contrôles ci-dessous ; inscrire pour chacun
   `OK`, `N/A` avec justification, ou `Exception <ID>`, avec la preuve non
   sensible (commande, run CI, capture de configuration ou ticket).
3. Faire relire le compte rendu par un mainteneur qui n'a pas réalisé seul tous
   les contrôles. Toute exception doit avoir un propriétaire, une échéance et
   une acceptation explicite du risque avant la promotion.
4. Décider si un pentest est requis avec les critères ci-dessous. Un pentest
   requis mais inachevé bloque la promotion ; une exception ne peut pas le
   transformer en simple contrôle de checklist.
5. Continuer `npm run deploy` en donnant la référence et les deux décisions.
   Pour un déploiement web non interactif dont le SHA est déjà connu, fournir
   `MINDDY_SECURITY_REVIEW_REF`, `MINDDY_RESIDUAL_RISKS` (`none` ou
   `documented`) et `MINDDY_PENTEST_STATUS` (`not-required` ou `completed`). Le
   workflow valide aussi la version `1.0` de cette checklist avant de demander
   l'approbation de l'environnement `cloud-production`.

Les tests et recherches ci-dessous partent de la racine du dépôt. Remplacer
`<BASE_SHA>` par `origin/production` et `<CANDIDATE_URL>` par l'URL HTTPS
complète du déploiement candidat ou de staging. Les vérifications de
configuration à l'extérieur du dépôt doivent être datées dans la preuve.

## Contrôles obligatoires

| ID | Contrôle | Comment vérifier | Résultat attendu / preuve |
| --- | --- | --- | --- |
| HTTP-1 | HTTPS et HSTS | `curl -sS -D - -o /dev/null <CANDIDATE_URL>` puis inspecter `next.config.mjs` et la redirection HTTP→HTTPS de l'hébergeur. | HTTPS sans erreur ; redirection HTTP ; `Strict-Transport-Security` avec `max-age` d'au moins un an et `includeSubDomains`. La présence de `preload` ne vaut pas inscription à la preload list, décision séparée et quasi irréversible. |
| HTTP-2 | En-têtes navigateur | Sur pages publique, authentifiée, erreur et API : `curl -sS -D - -o /dev/null …`. Vérifier aussi les exceptions dans `next.config.mjs`. | CSP cohérente (`frame-ancestors`, `base-uri`, `form-action` selon la route), `X-Content-Type-Options: nosniff`, protection anti-framing, `Referrer-Policy` et `Permissions-Policy`. Toute exception de route est justifiée et testée. |
| HTTP-3 | Cache et contenu sensible | Examiner les nouveaux `GET`, `Cache-Control`, `revalidate`, `force-static`, `use cache` et le comportement CDN avec deux comptes. | Aucune réponse authentifiée ou donnée personnelle dans un cache partagé ; réponses sensibles `private`/`no-store` ; types MIME et téléchargements non exécutables. |
| REQ-1 | CSRF | Inventorier `POST`, `PUT`, `PATCH`, `DELETE` du diff : `git diff --name-only <BASE_SHA> -- app \| rg '/route\.ts$'`. Pour chaque route à cookie, vérifier token CSRF ou validation stricte `Origin`/`Host`/en-tête applicatif et effectuer un appel cross-origin négatif. | Requête légitime acceptée, requête cross-origin refusée. `SameSite` reste une défense supplémentaire, jamais l'unique justification. Les endpoints publics signés (webhooks/OAuth) ont leur contrôle propre. |
| REQ-2 | CORS | `rg -n 'Access-Control-Allow|cors|OPTIONS' app lib next.config.mjs` puis tester les preflights autorisés et non autorisés. | CORS absent par défaut. Origines, méthodes et en-têtes minimaux là où il est requis ; jamais d'origine réfléchie ou de `*` avec credentials. Un endpoint OAuth public en `*` ne reçoit aucun cookie et reste explicitement documenté. |
| SESS-1 | Cookies, sessions et tokens | Inspecter `lib/session-cookies.ts`, les autres `cookies.set`, la configuration Auth Supabase et les flux login/logout/refresh. Vérifier les `Set-Cookie` du candidat sans consigner leur valeur. | Cookies de session `Secure` en production et `SameSite=Lax`/`Strict` selon le flux ; `HttpOnly` lorsque l'architecture le permet. L'exception documentée des cookies lus par `@supabase/ssr` n'est pas élargie. Expiration bornée et rotation des refresh tokens actives. |
| SESS-2 | Invalidation et rejeu | Tester déconnexion, changement/réinitialisation du mot de passe, révocation administrative et rotation du refresh token sur un compte de test. | L'ancien token ou cookie ne redonne pas une session après l'événement prévu ; le rejeu d'un refresh token tourné échoue ; aucune session privilégiée durable sans justification. |
| DB-1 | RLS de toutes les tables | Examiner chaque migration du diff, puis `npx vitest run lib/schema-guardrails.test.ts` et des tests négatifs avec deux utilisateurs/projets. | RLS activée dès la création ; policies limitées à `authenticated`/`service_role`, séparation inter-projets démontrée, aucune policy `anon` ou condition toujours vraie introduite. |
| DB-2 | Permissions, vues et colonnes | Revoir `GRANT`/`REVOKE`, vues, fonctions `SECURITY DEFINER`, buckets Storage et accès PostgREST. Tester directement avec clés anon/auth de test. | Privilège minimal ; colonnes chiffrées/secrètes non sélectionnables ; `search_path` sûr pour les fonctions privilégiées ; buckets privés par défaut, formats publics servis sans contenu actif. |
| DB-3 | Contournements service-role | `git diff <BASE_SHA> -- 'app/**' 'lib/server/**' \| rg -n 'service\|admin\|supabaseService'` et tracer chaque identifiant fourni par le client jusqu'à son contrôle d'accès. | Chaque lecture/écriture qui contourne RLS refait explicitement authentification, autorisation par ressource et validation d'entrée avant l'appel privilégié. |
| DATA-1 | Clés API et secrets | `git diff <BASE_SHA>`, secret scanning GitHub, `rg -n 'NEXT_PUBLIC_|API_KEY|SECRET|TOKEN' app components lib public .env.example` et revue des variables Vercel/Supabase sans afficher leurs valeurs. | Aucun secret dans Git, bundle client, URL, capture, artefact ou log. Seules les clés explicitement publiques portent `NEXT_PUBLIC_`; clés privées chiffrées au repos, masquées à la lecture, à portée minimale et rotatables. |
| DATA-2 | Données personnelles | Cartographier les nouvelles données, exports, analytics, logs, sauvegardes et sous-traitants ; vérifier `docs/rgpd/` et les politiques de rétention/suppression. | Collecte minimale et finalité documentée ; accès et rétention bornés ; suppression/export testés ; aucune donnée personnelle réelle dans CI, previews, logs ou compte rendu de sécurité. |
| AUTH-1 | Politique de mots de passe | `npx vitest run lib/password-policy.test.ts lib/signup-wizard.test.ts`, puis vérifier que la politique Supabase de l'instance n'est pas plus faible que l'UI. | Longueur/complexité convenues appliquées côté serveur, mots de passe compromis refusés si l'option est disponible, messages sans fuite de compte. |
| AUTH-2 | MFA | Examiner les changements d'administration, de facturation, de clés et d'identités ; tester inscription, challenge, récupération et désactivation MFA. | MFA exigée pour les rôles/opérations définis à haut risque ; secrets et codes de récupération non journalisés, usage unique vérifié. Si MFA n'est pas applicable, justification inscrite. |
| API-1 | Endpoints sensibles | Inventorier auth, invitations, exports, uploads, webhooks, OAuth, IA, facturation, actions admin et nouvelles routes du diff. Tester sans session, avec autre tenant, entrée invalide, taille excessive et débit abusif. | Authentification et autorisation serveur en échec fermé, schéma et bornes validés à l'exécution, rate limit sur les opérations abusables, erreurs sans détails internes. Les webhooks utilisent la signature du corps brut ; les fetch sortants bornent protocole, hôte, redirections et IP privées. |
| SUPPLY-1 | Dépendances et chaîne de build | Vérifier les jobs `CI / Tests & typecheck`, `CI / Audit des dépendances`, l'installation figée et les alertes Dependabot/secret scanning. | SHA candidat vert, lockfiles cohérents, aucune vulnérabilité high/critical non acceptée, aucune étape de build nouvelle avec secret ou permission d'écriture injustifiée. |
| OPS-1 | Configuration et retour arrière | Comparer les variables/permissions Vercel, Supabase et GitHub à leur référence ; vérifier migration, sauvegarde restaurable, observabilité et procédure de rollback dans `docs/releases.md`. | Configuration revue sans exposer de valeur ; sauvegarde et rollback compatibles avec les migrations ; alertes et propriétaire d'incident identifiés. |

## Décision de pentest

Marquer le pentest `required-not-completed` et arrêter la release si au moins un
des cas suivants n'est pas déjà couvert par un pentest récent au périmètre
équivalent :

- nouveau mécanisme d'authentification, d'autorisation, MFA, session ou OAuth ;
- changement important de RLS, multi-tenant, `service_role`, stockage public ou
  exposition de données personnelles ;
- nouvelle surface à fort impact : paiement, upload actif, webhook, import,
  exécution de code/agent, intégration tierce privilégiée ou administration ;
- changement d'infrastructure, de frontière réseau ou lancement majeur avec un
  volume/exposition sensiblement supérieur ;
- menace nouvelle, incident récent, ou constat high/critical dont l'exploitation
  réaliste ne peut pas être exclue par tests et revue interne.

Le périmètre, la date, le prestataire, le rapport et le statut des corrections
du pentest sont référencés dans le compte rendu, sans publier les détails
sensibles. `completed` signifie que le rapport est reçu, les constats bloquants
sont corrigés et retestés, et les autres sont consignés comme risques résiduels.

## Exceptions et risques résiduels

Une ligne est obligatoire par contrôle non `OK`. Une exception sans échéance,
mesure compensatoire ou approbateur bloque la mise en production.

| ID | Contrôle | Écart et justification | Impact / probabilité | Mesure compensatoire | Propriétaire | Échéance | Approbateur |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EX-… | … | … | … | … | … | YYYY-MM-DD | … |

Le statut transmis au workflow est `none` si cette table est vide, sinon
`documented`. Une exception ne peut pas couvrir un secret exposé, une séparation
multi-tenant cassée, une vulnérabilité high/critical exploitable ou un pentest
requis mais inachevé.

## Modèle de compte rendu

```markdown
# Revue sécurité de release — <date> — <SHA>

- Checklist : 1.0 (`docs/security-release-checklist.md` au SHA `<SHA>`)
- Diff : `<production précédente>..<SHA>`
- Candidat/staging vérifié : <URL ou identifiant non sensible>
- Réalisateur : <nom> — Relecteur/approbateur : <nom>
- Pentest : not-required | completed | required-not-completed
- Référence pentest et justification : <référence ou justification>
- Risques résiduels : none | documented

| ID | Résultat | Preuve non sensible / note |
| --- | --- | --- |
| HTTP-1 | OK | … |
| … | … | … |

## Exceptions et risques résiduels

<recopier la table obligatoire ci-dessus, ou écrire « Aucun »>

## Verdict

- [ ] Tous les contrôles ont un résultat et une preuve.
- [ ] Les exceptions ont propriétaire, échéance et approbation.
- [ ] Le pentest n'est pas requis, ou il est terminé et ses constats bloquants sont retestés.
- [ ] Promotion de ce SHA explicitement approuvée.
```
