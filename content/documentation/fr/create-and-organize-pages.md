---
{
  "id": "create-and-organize-pages",
  "locale": "fr",
  "title": "Construire un wiki de projet",
  "summary": "Créez pages et sous-pages, organisez leur hiérarchie et mettez en avant les favoris partagés.",
  "topic": "Pages et bases de données",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P01"
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "content/knowledge/pages.md",
      "components/pages/page-create-menu.tsx",
      "components/pages/page-tree.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "page-comments-and-collaboration",
    "publish-a-page"
  ],
  "aliases": [
    "pages"
  ],
  "tags": [],
  "figures": [
    {
      "id": "create-and-organize-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/page-create-menu.png",
      "alt": "Menu de création proposant Nouvelle page et Nouvelle base de données.",
      "caption": "Les contrôles des pages du projet permettent de choisir un document ou une base de données.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "create-and-organize-pages-steps"
  ]
}
---

## Créer et organiser les pages {#create-and-organize-pages}

Ouvrez les pages d’un projet dont vous êtes membre. Le menu + propose une page pour un document ou une base pour une liste structurée. Donnez un titre utile et écrivez la spécification, décision ou procédure à conserver.

Créez des sous-pages pour les documents associés et déplacez-les ou réordonnez-les dans l’arbre. Une page ne peut pas devenir sa propre descendante. Une duplication crée un nouveau contenu plutôt qu’une référence vivante. Examinez la branche dupliquée avant modification ou partage.

## Favoris et suppression {#page-tree}

Ajoutez une page aux favoris pour la faire apparaître en haut de l’arbre du projet. Ces favoris sont partagés dans le projet, contrairement à une note du carnet privé. Liez une page au ticket qui a besoin de son contenu actuel ; le titre de la ressource suit les renommages.

La suppression envoie les pages prises en charge à la corbeille. Vérifiez la branche avant de supprimer, puis utilisez la récupération lorsque le contenu doit être conservé. Une entrée avec des valeurs de colonnes peut être réordonnée dans sa base, mais pas déplacée à l’extérieur. Si un déplacement est refusé, vérifiez hiérarchie et type d’entrée plutôt que de le forcer.


![Menu de création proposant Nouvelle page et Nouvelle base de données.](/documentation/fr/page-create-menu.png)
