---
{
  "id": "views-and-filters",
  "locale": "fr",
  "title": "Enregistrer une vue de votre travail",
  "summary": "Filtrez et classez des tickets sans modifier leurs propriétés enregistrées.",
  "topic": "Planifier et retrouver le travail",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W13"
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
      "content/knowledge/productivity.md",
      "components/board-toolbar.tsx",
      "components/sidebar-filter-field.tsx",
      "app/api/me/saved-views/route.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "share-a-view",
    "navigation",
    "search-and-shortcuts"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "views-and-filters-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-view-filters.png",
      "alt": "Filtres manuels d’une vue et menu de classement.",
      "caption": "Filtrez par propriétés du ticket ou choisissez un ordre. Le champ IA est facultatif pour ces commandes manuelles.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "views-and-filters-steps"
  ]
}
---

## Construire et enregistrer la vue {#views-and-filters}

Partez du tableau d’un projet ou d’une surface personnelle transversale. Utilisez filtres, classement et affichage pour choisir le travail à voir. Contrôlez le périmètre avant d’enregistrer : une vue personnelle et une vue de projet n’ont pas la même limite d’accès.

Filtrez selon les propriétés disponibles, comme état, responsable, priorité, catégories ou objectif. Classez les résultats pour clarifier la prochaine action. En kanban, les tickets restent regroupés par état ; modifier la vue ne modifie ni leurs états ni leurs affectations.

Enregistrez un nom qui décrit l’usage, sélectionnez de nouveau la vue dans la navigation et vérifiez ses filtres. Modifiez ou supprimez la vue lorsque son usage change. Le partage est une publication séparée, avec permissions et révocation propres.

![Filtres manuels d’une vue et menu de classement.](/documentation/fr/work-view-filters.png)

## Résultat vide ou inattendu {#view-recovery}

Vérifiez chaque filtre, le projet actif et votre adhésion si des tickets manquent. Retirez les filtres restrictifs avant de conclure à une suppression. Un ticket modifié peut quitter une vue filtrée. Recherchez son identifiant ou utilisez le tableau sans filtre pour vérifier les valeurs.

Une vue enregistrée n’est pas une copie des tickets. Supprimer la vue retire sa configuration ; supprimer les tickets sélectionnés modifie le travail du projet.
