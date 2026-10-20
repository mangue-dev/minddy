---
{
  "id": "permissions-and-public-links",
  "locale": "fr",
  "title": "Permissions et liens publics",
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
  "revision": 5,
  "sourceRevision": 5,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-693 project roles",
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
      "content/knowledge/settings-and-data.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review); agent:/root/min693_fr with agent:/root (fr MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance)",
    "date": "2026-10-17"
  },
  "related": [
    "pages",
    "views",
    "encryption-and-data-boundaries"
  ],
  "aliases": [],
  "tags": [
    "Comprendre permissions et liens publics"
  ],
  "figures": [
    {
      "id": "permissions-and-public-links-flow",
      "kind": "diagram",
      "src": "/documentation/fr/permissions-and-public-links-flow.svg",
      "alt": "Schéma: Contrôles du compte et du projet. Objet privé ou publication explicite. Ensemble publié uniquement et fichiers signés. Révoquer le lien ; fichiers signés expirent après.",
      "caption": "La publication expose uniquement le contenu sélectionné ; les liens de fichiers déjà délivrés peuvent rester valides après révocation, jusqu’à leur expiration.",
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
            "title": "Contrôles du compte et du projet"
          },
          {
            "title": "Objet privé ou publication explicite"
          },
          {
            "title": "Ensemble publié uniquement et fichiers signés"
          },
          {
            "title": "Révoquer le lien ; fichiers signés expirent après"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "permissions-and-public-links-flow"
  ]
}
---

## Comprendre permissions et liens publics {#permissions-and-public-links}

Le serveur contrôle l’accès au projet et votre rôle dans le projet à chaque opération. Chaque projet a un seul propriétaire, qui gère paramètres réservés, membres, rôles et intégrations. Les membres travaillent sur le contenu du projet. Les lecteurs peuvent le lire et, lorsque le propriétaire active **Peut commenter** pour eux, le commenter ; ils ne peuvent ni modifier le contenu ni publier de liens, et ne voient ni les intégrations ni les jetons de partage et de board. Le tableau des [rôles du projet](/docs/projects#member-permissions) détaille l’accès de chaque rôle. Masquer un contrôle côté client n’est pas une autorisation. Paramètres personnels, carnet et conversations Numo privées ne deviennent pas partagés avec un projet ajouté au contexte. MCP agit au nom du compte autorisé et applique, à chaque appel, le rôle actuel de ce compte dans chaque projet, sans donner à l’agent les droits d’administrateur d’instance. Les intégrations de projet avec des clés `mdy_` ne sont pas des personnes : elles gardent les permissions fixes de leur type et ne reçoivent aucun rôle.

Un changement de rôle ou un retrait s’applique à la requête suivante. Le contenu déjà transmis n’est pas rappelé, et une URL signée déjà émise pour un fichier privé reste valide jusqu’à son expiration, au plus 10 minutes plus tard.


![Schéma: Contrôles du compte et du projet. Objet privé ou publication explicite. Ensemble publié uniquement et fichiers signés. Révoquer le lien ; fichiers signés expirent après.](/documentation/fr/permissions-and-public-links-flow.svg)

## Comprendre la portée de publication {#publication}

Une page publiée ou vue partagée utilise un lien opaque, éventuellement protégé par mot de passe. Le propriétaire et les membres peuvent publier et révoquer ces liens ; les lecteurs ne le peuvent pas. Toute personne possédant le lien et, lorsqu’il est exigé, son mot de passe peut accéder au contenu publié. Révoquez le lien dès qu’il n’est plus nécessaire. Les sous-pages se résolvent uniquement dans l’ensemble publié ; les titres exclus ne sortent pas. Les fichiers sont signés uniquement pour les pages publiées, le bucket privé et les routes authentifiées restent fermés. Les mentions peuvent rester du texte sans lien vers un profil privé. Une base publiée montre uniquement les entrées incluses dans sa branche publiée.

## Tester le partage et sa révocation {#revocation}

Ouvrez le résultat dans une session déconnectée séparée, examinez contenu et fichiers attendus et vérifiez l’inaccessibilité des éléments exclus. Révoquez la publication et testez à nouveau. Les données déjà copiées ne peuvent être rappelées ; une URL de fichier signée reste éventuellement valide jusqu’à expiration, soit 24 heures pour les fichiers de page. Les liens secrets utilisateurs restent `noindex`, contrairement à la documentation officielle indexable. `noindex` guide les robots, sans contrôler l’accès. Ne collez pas de lien privé dans un rapport public ou un exemple.
