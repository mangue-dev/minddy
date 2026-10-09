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
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "deploy/self-hosted/scheduler.mjs"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
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
      "caption": "Ces composants ont des responsabilités distinctes. L’opérateur choisit une capacité optionnelle. Identifiants complets et conditions fournisseur. Destination externe explicitement choisie. Vérifier le comportement et suivre les coûts.",
      "revision": 2,
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
      "alt": "Schéma: Proxy HTTPS public. Origines application et Supabase public. Runner, base et ports internes privés. Jobs authentifiés, arrêtés en maintenance.",
      "caption": "Ces composants ont des responsabilités distinctes. Proxy HTTPS public. Origines application et Supabase public. Runner, base et ports internes privés. Jobs authentifiés, arrêtés en maintenance.",
      "revision": 2,
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
            "title": "Runner, base et ports internes privés"
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

Définissez MINDDY_PUBLIC_APP_URL comme une origine absolue unique, sans chemin ni barre finale. Un service public utilise HTTPS ; localhost et une IPv4 privée de confiance peuvent utiliser HTTP. MINDDY_PUBLIC_SUPABASE_URL et MINDDY_PUBLIC_SUPABASE_ANON_KEY doivent désigner la même pile Supabase. Ces valeurs arrivent au navigateur. SUPABASE_SERVICE_ROLE_KEY reste exclusivement côté serveur et est obligatoire en production. Ne la mettez jamais dans une variable publique ni un bundle client. L’URL de base de données sert aux outils et ne remplace pas la configuration API.

### Conserver les secrets {#secrets}

L’installateur crée les valeurs manquantes de GIT_STATE_SECRET, GIT_TOKEN_ENCRYPTION_SECRET, AI_KEY_ENCRYPTION_SECRET, FEEDBACK_SSO_ENCRYPTION_SECRET, MINDDY_DATA_ROOT_KEY, CRON_SECRET et AGENT_RUNNER_SECRET. La racine de chiffrement contient exactement 64 caractères hexadécimaux. Gardez-la hors de PostgreSQL avec une copie de récupération protégée. Conservez l’environnement en mode 0600 et hors de Git. Ne l’exécutez pas comme script shell et ne l’affichez pas. Relancer l’installation ne renouvelle pas les secrets. Leur perte peut rendre les données existantes illisibles ; une rotation volontaire exige la procédure de récupération correspondante.

### Appliquer et contrôler une modification {#capabilities}

MINDDY_PUBLIC_SITE_NAME et MINDDY_PUBLIC_CONTACT_EMAIL identifient votre instance. ADMIN_EMAILS est une liste d’administrateurs séparés par des virgules ; l’accès privilégié exige aussi MFA. OAUTH_ISSUER reste normalement vide, sauf si vous publiez volontairement OAuth à une autre origine stable. Désactivez IA et facturation gérées en self-hosted. Activez les services optionnels avec leur configuration complète. Redémarrez ou recréez l’application après un changement de valeurs publiques au runtime ; l’image OCI ne nécessite pas de reconstruction. Le doctor distingue capacité incomplète et panne du cœur. Testez ensuite les liens de compte et callbacks sur l’origine prévue.

## Activer volontairement les fournisseurs optionnels {#optional-providers}

Le cœur n’exige ni Stripe, ni PostHog, ni compte Cloud, ni clé IA gérée par minddy. Les services externes ajoutent coûts, permissions et destinations des données. Examinez leurs conditions avant activation. Les diagnostics signalent les valeurs manquantes au lieu de choisir un fournisseur de secours. Une instance self-hosted peut employer des clés IA personnelles ou des endpoints locaux accessibles. Laissez MINDDY_MANAGED_AI et MINDDY_MANAGED_BILLING désactivés ; une clé OpenRouter seule ne sélectionne pas Cloud.


![Schéma: L’opérateur choisit une capacité optionnelle. Identifiants complets et conditions fournisseur. Destination externe explicitement choisie. Vérifier le comportement et suivre les coûts.](/documentation/fr/optional-providers-flow.svg)

### Renseigner les fournisseurs {#configure}

L’email applicatif exige EMAIL_PROVIDER=resend, RESEND_API_KEY, FEEDBACK_EMAIL_FROM et INVITATION_EMAIL_FROM. console est refusé en production ; SMTP Auth reste séparé. Web Push exige les clés VAPID publique et privée et VAPID_SUBJECT ; les abonnements existants dépendent de cette paire. L’analytique exige une paire clé/hôte PostHog complète ; le suivi d’erreurs ajoute MINDDY_PUBLIC_ERROR_TRACKING=1. L’assistant d’installation propose application-email et web-push, à vous de fournir les identifiants externes. N’employez pas les identités d’expéditeur minddy ni ses identifiants de release native sur une autre instance.

### Connecter Git et l’exécution de code {#git-and-code}

GitHub.com et GitLab.com sont pris en charge, contrairement à Enterprise Server et GitLab autogéré. Les connexions lancées par l’utilisateur peuvent utiliser le relais forge géré ; refusez-le avec --no-forge-relay ou MINDDY_FORGE_RELAY=0 puis configurez vos propres applications. Les connexions existantes gardent leur canal jusqu’à reconnexion. Le serveur de référence inclut un runner Docker self-hosted de confiance. Vercel Sandbox est une alternative explicite avec ses identifiants et MINDDY_DATA_ROOT_KEY valide, même sans chiffrement du contenu. L’exécution desktop locale est retirée. Une configuration absente bloque la délégation au lieu d’exécuter du code sur l’ordinateur de l’utilisateur.

L’image publiée de l’application inclut Node.js et Git, mais retire volontairement npm, npx et Corepack. Le profil Compose de référence choisit aussi cette image pour les workers via AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Cela ne suffit pas pour un nouveau worker de code : le bootstrap OpenCode utilise npm pour installer son runtime et son plugin épinglés, même dans un dépôt sans dépendances de projet. Sans npm, l’exécution s’arrête au bootstrap ; la conversation ne permet pas de conclure qu’un fichier du projet a été modifié ou qu’un test a réussi. Utilisez une image dédiée aux workers, construite et vérifiée par l’opérateur, avec Node.js 24, npm, Git et les outils nécessaires au projet, en surchargeant AGENT_RUNNER_SANDBOX_IMAGE dans le service runner. Conservez les contraintes d’isolation du runner. Vérifiez le bootstrap, le clonage, les véritables tests et le diff obtenu avant d’autoriser la délégation de code. Corriger les fichiers du runner ne fournit pas cette chaîne d’outils au worker.

## Exposer les origines publiques et exécuter les tâches planifiées {#proxy-network-and-jobs}

Une installation publique exige un proxy TLS et une redirection HTTP vers HTTPS. Origines applicative et Supabase, redirections Auth, callbacks OAuth et en-têtes transmis doivent correspondre. Gardez PostgreSQL, Studio, ports internes et runner hors d’Internet. En full, l’application appelle http://kong:8000 en interne ; le navigateur et les liens générés conservent l’origine publique Supabase. HTTP privé exige localhost ou une IPv4 privée de confiance, sans redirection de ports du routeur.


![Schéma: Proxy HTTPS public. Origines application et Supabase public. Runner, base et ports internes privés. Jobs authentifiés, arrêtés en maintenance.](/documentation/fr/proxy-network-and-jobs-flow.svg)

### Fournir une planification authentifiée {#schedules}

Les profils Compose de référence démarrent leur planificateur et génèrent CRON_SECRET. Un déploiement personnalisé depuis les sources doit fournir un planificateur HTTP équivalent. Chaque requête envoie `Authorization: Bearer <CRON_SECRET>` ; une valeur vide ou incorrecte retourne 401. Ne journalisez pas cet en-tête. Les horaires candidats ci-dessous sont en UTC. Utilisez l’ensemble de la version déployée : les routes peuvent évoluer avec l’application.


Le scheduler publié en v0.11.0 n’inclut pas numo-turns. Le scheduler candidat a été corrigé pour l’appeler chaque minute. Le tableau décrit ce planning candidat corrigé ; ne supposez pas que ce job existe dans un déploiement v0.11.0 intact.

| Endpoint | Horaire (UTC) |
| --- | --- |
| `/api/cron/feedback-analysis` | `0 * * * *` |
| `/api/cron/agent-drain` | `*/2 * * * *` |
| `/api/cron/numo-turns` | `* * * * *` |
| `/api/cron/forge-relay-deliveries` | `* * * * *` |
| `/api/cron/forge-relay-maintenance` | `35 * * * *` |
| `/api/cron/automations` | `*/2 * * * *` |
| `/api/cron/smart-assign` | `*/5 * * * *` |
| `/api/cron/routines` | `*/5 * * * *` |
| `/api/cron/billing-sync` | `15 * * * *` |
| `/api/cron/fx-rate` | `30 15 * * *` |
| `/api/cron/encryption-maintenance` | `15 * * * *` |
| `/api/cron/data-retention` | `45 3 * * *` |

### Arrêter les jobs en maintenance {#maintenance}

Arrêtez planificateur, application, workers et accès public Supabase avant sauvegarde ou migration. L’arrêt de l’application seule autorise encore des écritures API directes. Effectuez les contrôles de maintenance pendant que jobs et entrée publique restent fermés, puis rouvrez après validation de la base, Auth, Storage et application. Pour un job inactif, vérifiez en privé état du planificateur, origine canonique et secret. Les routines exigent le planificateur serveur, sans application desktop ouverte.
