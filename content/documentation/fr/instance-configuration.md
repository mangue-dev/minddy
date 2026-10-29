---
{
  "id": "instance-configuration",
  "locale": "fr",
  "title": "Configuration d’instance",
  "summary": "Configurez les origines, les secrets et les fournisseurs optionnels, exposez les points d’accès réseau prévus et maintenez l’exécution des tâches planifiées.",
  "topic": "Exploiter une instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H05",
    "H09",
    "H08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 13,
  "sourceRevision": 13,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.1 (MIN-788 Supabase self-hosted/v0.8.3)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      ".env.example",
      "docs/self-hosting.md",
      "lib/capabilities.ts",
      "docs/editions.md",
      "content/knowledge/self-hosting.md",
      "docs/self-hosting-distribution.md",
      "vercel.json",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/scheduler.mjs",
      "app/api/cron/issue-index/route.ts",
      "app/api/cron/smart-fill-reevaluation/route.ts"
    ]
  },
  "review": {
    "revision": 13,
    "fact": "agent:claude-code (MIN-847 MINDDY_CONFIG_OVERRIDES sentence checked against lib/server/instance-variables.ts and scripts/self-hosting-install.mjs); agent:claude-code (MIN-829 MINDDY_PUBLISH_MODEL_CONFIG sentence checked against app/api/recommended-models/route.ts); agent:/root/min750 (schedule table and release delta sentence checked against vercel.json and deploy/self-hosted/scheduler.mjs after adding smart-fill-reevaluation; rest of the article unchanged since the 0.20.0 release review; no screenshot in scope); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted); agent:claude-code (MIN-788: Supabase self-hosted/v0.8.3 pin, api-gw gateway name and the upstream release change checked against the pinned upstream files and overlay; full profile installed on v0.8.3 and a v0.7.2 instance moved with the documented sequence on a local Docker host, then sign-in, realtime and attachment SHA-256 verified; no screenshot in scope)",
    "language": "agent:claude-code (fr MIN-829 sentence; self-reviewed; agent review, not human acceptance); agent:/root/min750 (fr table row and release delta sentence; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-788 changed passages; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "workspace-encryption",
    "authentication-and-email",
    "architecture-and-data-flows",
    "update-an-instance",
    "numo"
  ],
  "aliases": [
    "optional-providers",
    "proxy-network-and-jobs"
  ],
  "tags": [
    "Configurer les origines, secrets et capacités de l’instance",
    "Activer volontairement les fournisseurs optionnels",
    "Exposer les origines publiques et exécuter les tâches planifiées"
  ],
  "figures": [
    {
      "id": "optional-providers-flow",
      "kind": "diagram",
      "src": "/documentation/fr/optional-providers-flow.svg",
      "alt": "Schéma: L’opérateur choisit une capacité optionnelle. Identifiants complets et conditions fournisseur. Destination externe explicitement choisie. Vérifier le comportement et suivre les coûts.",
      "caption": "Activer un service optionnel ajoute ses propres identifiants, destinations de données et coûts d’utilisation.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "L’opérateur choisit une capacité optionnelle"
          },
          {
            "title": "Identifiants complets et conditions fournisseur"
          },
          {
            "title": "Destination externe explicitement choisie"
          },
          {
            "title": "Vérifier le comportement et suivre les coûts"
          }
        ]
      }
    },
    {
      "id": "proxy-network-and-jobs-flow",
      "kind": "diagram",
      "src": "/documentation/fr/proxy-network-and-jobs-flow.svg",
      "alt": "Schéma: Proxy HTTPS public. Origines application et Supabase public. Base et ports internes privés. Jobs authentifiés, arrêtés en maintenance.",
      "caption": "L’accès public utilise HTTPS, tandis que les services internes restent privés et les tâches planifiées sont arrêtées pendant la maintenance.",
      "revision": 13,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Proxy HTTPS public"
          },
          {
            "title": "Origines application et Supabase public"
          },
          {
            "title": "Base et ports internes privés"
          },
          {
            "title": "Jobs authentifiés, arrêtés en maintenance"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "optional-providers-flow",
    "proxy-network-and-jobs-flow"
  ]
}
---

La configuration d’instance définit les origines publiques, les secrets et les services proposés aux utilisateurs. Préservez les identifiants existants avant de modifier l’environnement protégé, renseignez tous les paramètres nécessaires à chaque fournisseur optionnel, puis vérifiez l’exposition réseau et les tâches planifiées authentifiées.

## Configurer les origines, secrets et capacités de l’instance {#instance-configuration}

Définissez `MINDDY_PUBLIC_APP_URL` comme une origine absolue unique, sans chemin ni barre finale. Un service public utilise HTTPS ; `localhost` et une IPv4 privée de confiance peuvent utiliser HTTP. `MINDDY_PUBLIC_SUPABASE_URL` et `MINDDY_PUBLIC_SUPABASE_ANON_KEY` doivent désigner la même pile Supabase. Ces valeurs arrivent au navigateur. `SUPABASE_SERVICE_ROLE_KEY` reste exclusivement côté serveur et est obligatoire en production. Ne la mettez jamais dans une variable publique ni un bundle client. L’URL de base de données sert aux outils et ne remplace pas la configuration API.

### Conserver les secrets {#secrets}

L’installateur crée les valeurs manquantes de `GIT_STATE_SECRET`, `GIT_TOKEN_ENCRYPTION_SECRET`, `AI_KEY_ENCRYPTION_SECRET`, `FEEDBACK_SSO_ENCRYPTION_SECRET`, `MINDDY_DATA_ROOT_KEY` et `CRON_SECRET`. La racine de chiffrement contient exactement 64 caractères hexadécimaux. Gardez-la hors de PostgreSQL avec une copie de récupération protégée. Conservez l’environnement en mode `0600` et hors de Git. Ne l’exécutez pas comme script shell et ne l’affichez pas. Relancer l’installation ne renouvelle pas les secrets. Leur perte peut rendre les données existantes illisibles ; une rotation volontaire exige la procédure de récupération correspondante.

### Appliquer et contrôler une modification {#capabilities}

`MINDDY_PUBLIC_SITE_NAME` et `MINDDY_PUBLIC_CONTACT_EMAIL` identifient votre instance. `ADMIN_EMAILS` est une liste d’administrateurs séparés par des virgules ; l’accès privilégié exige aussi MFA. `MINDDY_PUBLISH_MODEL_CONFIG=1` publie la configuration de modèles IA de l’instance à l’adresse `/api/recommended-models` (voir [la configuration de modèles recommandée](/docs/recommended-models)) ; laissez-la vide sauf si d’autres instances l’importent. `MINDDY_CONFIG_OVERRIDES=1` permet aux administrateurs de modifier certaines variables depuis l’administration, dont les valeurs remplacent alors celles de ce fichier ([modifier les variables de l’instance](/docs/instance-administration#instance-variables)) ; seul le fichier peut la définir. `OAUTH_ISSUER` reste normalement vide, sauf si vous publiez volontairement OAuth à une autre origine stable. Désactivez IA et facturation gérées en self-hosted. Activez les services optionnels avec leur configuration complète. Redémarrez ou recréez l’application après un changement de valeurs publiques au runtime ; l’image OCI ne nécessite pas de reconstruction. Le doctor distingue capacité incomplète et panne du cœur. Testez ensuite les liens de compte et callbacks sur l’origine prévue.

### Configurer les retours et les signalements de documentation {#product-feedback}

Définissez `MINDDY_FEEDBACK_KEY` avec une clé d’intégration de retours pour activer Partager un retour dans l’app. Pour les signalements de documentation, créez une intégration de retours distincte dans le projet destinataire, choisissez l’objectif Documentation par défaut et enregistrez sa clé sous `MINDDY_DOCUMENTATION_FEEDBACK_KEY`. Les deux clés restent côté serveur. Les envois passent par `/api/v1/feedback` sur l’origine définie par `MINDDY_PUBLIC_APP_URL`. Redémarrez l’application après toute modification de ces valeurs.

Signaler une erreur sur un article nécessite un compte connecté. Après connexion, le lecteur retrouve le même article avec le modal Partager un retour ouvert. Le titre et la description sont initialement vides. Après l’envoi, le serveur ajoute l’identifiant de l’article, sa langue, sa révision et son URL publique au signalement ; ces informations ne sont pas des champs modifiables du formulaire. L’intégration de documentation rattache automatiquement le retour à l’objectif choisi. Sans `MINDDY_DOCUMENTATION_FEEDBACK_KEY`, le bouton de signalement est désactivé avec une explication.

## Activer volontairement les fournisseurs optionnels {#optional-providers}

Le cœur n’exige ni Stripe, ni PostHog, ni compte Cloud, ni clé IA gérée par minddy. Les services externes ajoutent coûts, permissions et destinations des données. Examinez leurs conditions avant activation. Les diagnostics signalent les valeurs manquantes au lieu de choisir un fournisseur de secours. Une instance self-hosted peut employer des clés IA personnelles ou des endpoints locaux accessibles. Laissez `MINDDY_MANAGED_AI` et `MINDDY_MANAGED_BILLING` désactivés ; une clé OpenRouter seule ne sélectionne pas Cloud.


![Schéma: L’opérateur choisit une capacité optionnelle. Identifiants complets et conditions fournisseur. Destination externe explicitement choisie. Vérifier le comportement et suivre les coûts.](/documentation/fr/optional-providers-flow.svg)

### Renseigner les fournisseurs {#configure}

L’email applicatif exige `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `FEEDBACK_EMAIL_FROM` et `INVITATION_EMAIL_FROM`. `console` est refusé en production ; SMTP Auth reste séparé. Web Push exige les clés VAPID publique et privée et `VAPID_SUBJECT` ; les abonnements existants dépendent de cette paire. L’analytique exige une paire clé/hôte PostHog complète ; le suivi d’erreurs ajoute `MINDDY_PUBLIC_ERROR_TRACKING=1`. L’assistant d’installation propose `application-email` et `web-push`, à vous de fournir les identifiants externes. N’employez pas les identités d’expéditeur minddy ni ses identifiants de release native sur une autre instance.

### Connecter Git et l’exécution de code {#git-and-code}

GitHub.com et GitLab.com sont pris en charge, contrairement à Enterprise Server et GitLab autogéré. Les connexions lancées par l’utilisateur peuvent utiliser le relais forge géré ; refusez-le avec `--no-forge-relay` ou `MINDDY_FORGE_RELAY=0` puis configurez vos propres applications. Les connexions existantes gardent leur canal jusqu’à reconnexion. Numo n’exécute pas de code : le serveur de référence n’a besoin d’aucun runner de code ni d’aucune sandbox, et aucun service ne reçoit le socket Docker. Les réglages laissés par une release antérieure, comme `AGENT_EXECUTION_BACKEND`, `AGENT_RUNNER_URL`, `AGENT_RUNNER_SECRET`, `AGENT_CONTROL_ORIGIN` et les identifiants Vercel Sandbox, sont ignorés ; retirez-les de l’environnement protégé.

## Exposer les origines publiques et exécuter les tâches planifiées {#proxy-network-and-jobs}

Une installation publique exige un proxy TLS et une redirection HTTP vers HTTPS. Origines applicative et Supabase, redirections Auth, callbacks OAuth et en-têtes transmis doivent correspondre. Gardez PostgreSQL, Studio et ports internes hors d’Internet. En full, l’application appelle `http://api-gw:8000` en interne ; le navigateur et les liens générés conservent l’origine publique Supabase. HTTP privé exige `localhost` ou une IPv4 privée de confiance, sans redirection de ports du routeur.


![Schéma: Proxy HTTPS public. Origines application et Supabase public. Base et ports internes privés. Jobs authentifiés, arrêtés en maintenance.](/documentation/fr/proxy-network-and-jobs-flow.svg)

### Fournir une planification authentifiée {#schedules}

Les profils Compose de référence démarrent leur planificateur et génèrent `CRON_SECRET`. Un déploiement personnalisé depuis les sources doit fournir un planificateur HTTP équivalent. Chaque requête envoie `Authorization: Bearer <CRON_SECRET>` ; une valeur vide ou incorrecte retourne 401. Ne journalisez pas cet en-tête. Les horaires ci-dessous sont en UTC et appartiennent à cette version. Utilisez l’ensemble de la version déployée : les routes peuvent évoluer avec l’application.


Par rapport au scheduler de la v0.11.0, cette version ajoute `numo-turns`, `forge-relay-maintenance`, `page-materialization`, `issue-index` et `smart-fill-reevaluation`, et n’appelle plus `/api/cron/agent-drain` ni `/api/cron/automations`, retirés avec le travail de code de Numo et les automatisations de projet. Un scheduler personnalisé copié depuis la v0.11.0 doit être mis à jour selon ce tableau.

| Endpoint | Horaire (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/page-materialization` | `* * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/smart-fill-reevaluation` | `* * * * *` |
| `/api/cron/issue-index` | `25 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |

### Arrêter les jobs en maintenance {#maintenance}

Arrêtez planificateur, application, workers et accès public Supabase avant sauvegarde ou migration. L’arrêt de l’application seule autorise encore des écritures API directes. Effectuez les contrôles de maintenance pendant que jobs et entrée publique restent fermés, puis rouvrez après validation de la base, Auth, Storage et application. Pour un job inactif, vérifiez en privé état du planificateur, origine canonique et secret. Les routines exigent le planificateur serveur, sans application desktop ouverte.
