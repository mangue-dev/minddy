---
{
  "id": "permissions-and-public-links",
  "locale": "fr",
  "title": "Comprendre permissions et liens publics",
  "summary": "Le serveur contrôle l’accès au projet à chaque opération.",
  "topic": "Concepts techniques",
  "type": "explanation",
  "audiences": [
    "owner",
    "integrator"
  ],
  "workflows": [
    "T02"
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
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "lib/server/pages.ts",
      "lib/server/page-publication.ts",
      "lib/server/mcp/auth.ts",
      "proxy.ts",
      "content/knowledge/settings-and-data.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "publish-a-page",
    "share-a-view",
    "encryption-and-data-boundaries"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "permissions-and-public-links-flow",
      "kind": "diagram",
      "src": "/documentation/fr/permissions-and-public-links-flow.svg",
      "alt": "Schéma: Contrôles du compte et du projet. Objet privé ou publication explicite. Ensemble publié uniquement et fichiers signés. Révoquer le lien ; fichiers signés expirent après.",
      "caption": "Ces composants ont des responsabilités distinctes. Contrôles du compte et du projet. Objet privé ou publication explicite. Ensemble publié uniquement et fichiers signés. Révoquer le lien ; fichiers signés expirent après.",
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
    "permissions-and-public-links-flow"
  ]
}
---

## Comprendre permissions et liens publics {#permissions-and-public-links}

Le serveur contrôle l’accès au projet à chaque opération. Le propriétaire gère paramètres réservés, membres et intégrations. Les membres travaillent sur tickets et pages selon les vérifications de permission ; masquer un contrôle côté client n’est pas une autorisation. Paramètres personnels, carnet et conversations Numo privées ne deviennent pas partagés avec un projet ajouté au contexte. MCP agit au nom du compte autorisé et vérifie l’appartenance au projet, sans donner à l’agent les droits d’administrateur d’instance.


![Schéma: Contrôles du compte et du projet. Objet privé ou publication explicite. Ensemble publié uniquement et fichiers signés. Révoquer le lien ; fichiers signés expirent après.](/documentation/fr/permissions-and-public-links-flow.svg)

## Comprendre la portée de publication {#publication}

Une page publiée ou vue partagée utilise un lien opaque, éventuellement protégé par mot de passe. Toute personne possédant le lien et, lorsqu’il est exigé, son mot de passe peut accéder au contenu publié. Révoquez le lien dès qu’il n’est plus nécessaire. Les sous-pages se résolvent uniquement dans l’ensemble publié ; les titres exclus ne sortent pas. Les fichiers sont signés uniquement pour les pages publiées, le bucket privé et les routes authentifiées restent fermés. Les mentions peuvent rester du texte sans lien vers un profil privé. Une base publiée montre uniquement les entrées incluses dans sa branche publiée.

## Tester le partage et sa révocation {#revocation}

Ouvrez le résultat dans une session déconnectée séparée, examinez contenu et fichiers attendus et vérifiez l’inaccessibilité des éléments exclus. Révoquez la publication et testez à nouveau. Les données déjà copiées ne peuvent être rappelées ; une URL de fichier signée reste éventuellement valide jusqu’à expiration, soit 24 heures pour les fichiers de page. Les liens secrets utilisateurs restent noindex, contrairement à la documentation officielle indexable. noindex guide les robots, sans contrôler l’accès. Ne collez pas de lien privé dans un rapport public ou un exemple.
