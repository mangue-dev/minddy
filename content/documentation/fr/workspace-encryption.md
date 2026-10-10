---
{
  "id": "workspace-encryption",
  "locale": "fr",
  "title": "Chiffrement de l’espace de travail",
  "summary": "Vérifiez le chiffrement applicable à votre version et conservez les clés de récupération des identifiants et du contenu.",
  "topic": "Exploiter une instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
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
      "docs/self-hosting.md",
      "scripts/self-hosting-encryption.mjs",
      "lib/server/encryption/data-policy.json",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "encryption-and-data-boundaries",
    "backups-and-restoration"
  ],
  "aliases": [],
  "tags": [
    "Configurer le chiffrement et conserver ses clés"
  ],
  "figures": [
    {
      "id": "workspace-encryption-flow",
      "kind": "diagram",
      "src": "/documentation/fr/workspace-encryption-flow.svg",
      "alt": "Schéma: Racine dédiée hors de PostgreSQL. Clés projet, utilisateur et système enveloppées. Déchiffrement autorisé sur le serveur. Restauration base + Storage + mêmes clés.",
      "caption": "Restaurer du contenu chiffré exige les données et les clés correspondantes, dont la racine conservée hors de la base.",
      "revision": 5,
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
            "title": "Racine dédiée hors de PostgreSQL"
          },
          {
            "title": "Clés projet, utilisateur et système enveloppées"
          },
          {
            "title": "Déchiffrement autorisé sur le serveur"
          },
          {
            "title": "Restauration base + Storage + mêmes clés"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "workspace-encryption-flow"
  ]
}
---

## Configurer le chiffrement et conserver ses clés {#workspace-encryption}

Les options `--encryption` de l’installateur et du bootstrap décrites ici appartiennent à l’outillage candidat 0.11.1 identifié. L’installateur et le bootstrap publiés en v0.11.0 ne les acceptent pas. Le runtime de cette version reconnaît `MINDDY_CONTENT_ENCRYPTION_ENABLED` ; le service Compose de référence charge le fichier protégé via `env_file`. Une modification explicite du flag nécessite donc de recréer le service de l’application avec le même environnement, puis de vérifier le schéma et le comportement réel. Une clé `MINDDY_DATA_ROOT_KEY` générée ne prouve pas que le contenu de l’espace est chiffré. Utilisez un outillage et une configuration correspondants, explicitement vérifiés pour la version choisie, avant d’accueillir des utilisateurs ou de modifier une instance existante.

Les nouvelles installations locales et serveur activent le chiffrement par défaut et génèrent une `MINDDY_DATA_ROOT_KEY` dédiée. Pour un nouveau serveur, indiquez au besoin `--encryption enabled` ou `--encryption disabled`. Les deux choix conservent le chiffrement des identifiants et produisent une racine indépendante ; l’option concerne le contenu de l’espace de travail. Pour le desktop local, préparez la configuration choisie avec la commande ci-dessous avant d’ouvrir le clone. La racine aléatoire de 32 octets est encodée en exactement 64 caractères hexadécimaux et reste hors de PostgreSQL.

```bash
pnpm bootstrap:supabase -- --minimal --app-url http://localhost:6463 --encryption enabled
```


![Schéma: Racine dédiée hors de PostgreSQL. Clés projet, utilisateur et système enveloppées. Déchiffrement autorisé sur le serveur. Restauration base + Storage + mêmes clés.](/documentation/fr/workspace-encryption-flow.svg)

## Traiter les données existantes et relances {#existing-data}

Une configuration existante sans flag reste désactivée jusqu’à modification volontaire. Les relances conservent flag et racine ; un choix contradictoire échoue. Ne générez jamais une autre clé pour réparer une instance activée : retrouvez l’originale. Appliquez schéma et vérification avant tout import. La maintenance par lots avance la conversion des anciennes données et la rotation ; activer le flag ne prouve pas que tout l’historique ou les copies conservées ont été convertis. Désactiver le flag ne déchiffre pas les données protégées et n’autorise pas l’écriture en clair dans les périmètres activés.

## Préserver la récupération {#recovery}

Le serveur déchiffre pour les utilisateurs autorisés et l’IA : il s’agit d’un chiffrement au repos, pas d’un secret de bout en bout face à l’opérateur. Emails de connexion et métadonnées de routage restent lisibles ; fournisseurs externes et exports nécessitent leur propre protection. Gardez racines actuelles et anciennes pour les sauvegardes retenues. Chiffrez et contrôlez l’accès à une sauvegarde contenant configuration et données. Répétez une restauration base plus Storage avec clés correspondantes. Changer de racine impose un réenveloppement hors ligne protégé, applications arrêtées ; remplacer simplement la variable rend le contenu illisible.
