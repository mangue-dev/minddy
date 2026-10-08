---
{
  "id": "managed-or-source-installation",
  "locale": "fr",
  "title": "Installer avec Supabase géré ou depuis les sources",
  "summary": "Supabase géré décrit l’exploitation du backend.",
  "topic": "Exploiter une instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H04"
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
      "docs/self-hosting.md",
      "docs/self-hosting-distribution.md",
      "deploy/self-hosted/compose.managed.yml"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "instance-configuration",
    "logical-and-provider-backups",
    "proxy-network-and-jobs"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "managed-or-source-installation-flow",
      "kind": "diagram",
      "src": "/documentation/fr/managed-or-source-installation-flow.svg",
      "alt": "Schéma: Votre projet Supabase géré. PostgreSQL, Auth, Storage, Realtime. Profil OCI OU application depuis un tag. Jobs et sauvegarde propres au profil.",
      "caption": "Ces composants ont des responsabilités distinctes. Votre projet Supabase géré. PostgreSQL, Auth, Storage, Realtime. Profil OCI OU application depuis un tag. Jobs et sauvegarde propres au profil.",
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
    "managed-or-source-installation-flow"
  ]
}
---

## Installer avec Supabase géré ou depuis les sources {#managed-or-source-installation}

Supabase géré décrit l’exploitation du backend. Il peut accompagner le profil applicatif OCI officiel ou un serveur construit depuis les sources. Distinguez ces déploiements dans les relevés d’installation et de validation. Le backend doit fournir PostgreSQL, Auth, Storage et Realtime. Pour le profil OCI managed guidé, fournissez un projet sur supabase.com, son URL publique, les clés anon et service-role et une connexion PostgreSQL accessible aux outils de bootstrap. Utilisez votre propre projet ; les identifiants Minddy Cloud ne sont pas des paramètres d’installation.


![Schéma: Votre projet Supabase géré. PostgreSQL, Auth, Storage, Realtime. Profil OCI OU application depuis un tag. Jobs et sauvegarde propres au profil.](/documentation/fr/managed-or-source-installation-flow.svg)

## Configurer Supabase géré {#managed}

Depuis le répertoire de la release vérifiée, lancez la commande ci-dessous. IMAGE est le digest contrôlé dans l’article de compatibilité. Les valeurs contenant ... sont des exemples inutilisables. Récupérez les vraies valeurs en privé et évitez les secrets dans l’historique ou les journaux partagés. L’installateur conserve l’environnement protégé existant, inclut son planificateur et son runner et laisse les services optionnels inactifs tant qu’ils ne sont pas configurés. Configurez séparément SMTP Auth et les redirections exactes dans votre projet Supabase.

```bash
pnpm self-host:install -- --non-interactive --mode managed \
  --app-url https://tickets.example.com --admin-email ops@example.com \
  --supabase-url https://project.supabase.co --anon-key '...' \
  --service-role-key '...' --db-url 'postgresql://postgres:...@db.example.com:5432/postgres' \
  --image "$IMAGE"
```

## Déployer depuis les sources {#source}

Depuis les sources, installez les dépendances figées du tag, fournissez l’environnement de l’application et de Supabase, lancez le bootstrap, construisez puis démarrez le serveur de production derrière votre proxy. Définissez MINDDY_PUBLIC_* avant le démarrage. Vous devez fournir un planificateur durable avec les appels authentifiés décrits dans l’article réseau ; une compilation seule n’exécute aucun job. Vérifiez migrations et Storage, puis testez Auth, création de tickets, octets des fichiers et Realtime. Sauvegardez cette instance avec la procédure logique ou fournisseur. Ne validez pas une installation OCI en la remplaçant par un serveur issu des sources.

```bash
pnpm install --frozen-lockfile
pnpm bootstrap:supabase -- --db-url "$SUPABASE_DB_URL" --env-file .env.local
pnpm build
pnpm start
```
