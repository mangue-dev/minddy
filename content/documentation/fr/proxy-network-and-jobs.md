---
{
  "id": "proxy-network-and-jobs",
  "locale": "fr",
  "title": "Exposer les origines publiques et exécuter les tâches planifiées",
  "summary": "Une installation publique exige un proxy TLS et une redirection HTTP vers HTTPS.",
  "topic": "Exploiter une instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "docs/self-hosting-distribution.md",
      "vercel.json",
      "deploy/self-hosted/compose.full.yml",
      "deploy/self-hosted/scheduler.mjs"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "update-an-instance",
    "numo-execution-model"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "proxy-network-and-jobs-flow",
      "kind": "diagram",
      "src": "/documentation/fr/proxy-network-and-jobs-flow.svg",
      "alt": "Schéma: Proxy HTTPS public. Origines application et Supabase public. Runner, base et ports internes privés. Jobs authentifiés, arrêtés en maintenance.",
      "caption": "Ces composants ont des responsabilités distinctes. Proxy HTTPS public. Origines application et Supabase public. Runner, base et ports internes privés. Jobs authentifiés, arrêtés en maintenance.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "proxy-network-and-jobs-flow"
  ]
}
---

## Exposer les origines publiques et exécuter les tâches planifiées {#proxy-network-and-jobs}

Une installation publique exige un proxy TLS et une redirection HTTP vers HTTPS. Origines applicative et Supabase, redirections Auth, callbacks OAuth et en-têtes transmis doivent correspondre. Gardez PostgreSQL, Studio, ports internes et runner hors d’Internet. En full, l’application appelle http://kong:8000 en interne ; le navigateur et les liens générés conservent l’origine publique Supabase. HTTP privé exige localhost ou une IPv4 privée de confiance, sans redirection de ports du routeur.


![Schéma: Proxy HTTPS public. Origines application et Supabase public. Runner, base et ports internes privés. Jobs authentifiés, arrêtés en maintenance.](/documentation/fr/proxy-network-and-jobs-flow.svg)

## Fournir une planification authentifiée {#schedules}

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


## Arrêter les jobs en maintenance {#maintenance}

Arrêtez planificateur, application, workers et accès public Supabase avant sauvegarde ou migration. L’arrêt de l’application seule autorise encore des écritures API directes. Effectuez les contrôles de maintenance pendant que jobs et entrée publique restent fermés, puis rouvrez après validation de la base, Auth, Storage et application. Pour un job inactif, vérifiez en privé état du planificateur, origine canonique et secret. Les routines exigent le planificateur serveur, sans application desktop ouverte.
