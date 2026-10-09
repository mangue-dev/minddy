---
{
  "id": "views",
  "locale": "fr",
  "title": "Vues et filtres",
  "summary": "Enregistrez une vue filtrée du travail accessible, partagez-la en lecture seule et révoquez l’accès public au besoin.",
  "topic": "Planifier et retrouver le travail",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W13",
    "W14"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "app/api/me/saved-views/route.ts",
      "app/api/views/[id]/share/route.ts",
      "app/share/[token]/page.tsx",
      "content/knowledge/feedback.md",
      "lib/server/view-shares.ts",
      "lib/public-board-projection.ts"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "navigation",
    "pages",
    "permissions-and-public-links"
  ],
  "aliases": [
    "views-and-filters",
    "share-a-view"
  ],
  "tags": [
    "Enregistrer une vue de votre travail",
    "Partager une vue et révoquer son lien"
  ],
  "figures": [
    {
      "id": "views-and-filters-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-view-filters.png",
      "alt": "Filtres manuels d’une vue et menu de classement.",
      "caption": "Filtrez par propriétés du ticket ou choisissez un ordre. Le champ IA est facultatif pour ces commandes manuelles.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        288,
        393
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "share-a-view-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-share-view.png",
      "alt": "Dialogue de partage d’une vue avec l’accès privé sélectionné.",
      "caption": "Les accès privé, protégé par mot de passe et public correspondent à trois choix distincts. Cette vue reste privée sur la capture.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        496,
        230
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "views-and-filters-steps",
    "share-a-view-steps"
  ]
}
---

Une vue conserve vos filtres et votre affichage des tickets sans les copier ni les modifier. Configurez d’abord la vue pour votre travail. Partager une vue de projet éligible est une étape distincte qui donne aux visiteurs un accès en lecture au contenu publié.

## Enregistrer une vue de votre travail {#views-and-filters}

Partez du tableau d’un projet ou d’une surface personnelle transversale. Utilisez filtres, classement et affichage pour choisir le travail à voir. Contrôlez le périmètre avant d’enregistrer : une vue personnelle et une vue de projet n’ont pas la même limite d’accès.

Filtrez selon les propriétés disponibles, comme état, responsable, priorité, catégories ou objectif. Classez les résultats pour clarifier la prochaine action. En kanban, les tickets restent regroupés par état ; modifier la vue ne modifie ni leurs états ni leurs affectations.

Enregistrez un nom qui décrit l’usage, sélectionnez de nouveau la vue dans la navigation et vérifiez ses filtres. Modifiez ou supprimez la vue lorsque son usage change. Le partage est une publication séparée, avec permissions et révocation propres.

![Filtres manuels d’une vue et menu de classement.](/documentation/fr/work-view-filters.png)

### Résultat vide ou inattendu {#view-recovery}

Vérifiez chaque filtre, le projet actif et votre adhésion si des tickets manquent. Retirez les filtres restrictifs avant de conclure à une suppression. Un ticket modifié peut quitter une vue filtrée. Recherchez son identifiant ou utilisez le tableau sans filtre pour vérifier les valeurs.

Une vue enregistrée n’est pas une copie des tickets. Supprimer la vue retire sa configuration ; supprimer les tickets sélectionnés modifie le travail du projet.

## Partager une vue et révoquer son lien {#share-a-view}

Ouvrez le menu de la vue dans un tableau de projet éligible et choisissez Partager la vue. Vous devez avoir accès au projet ; une vue personnelle de ce projet peut être partagée seulement par son utilisateur. Les vues globales couvrant plusieurs projets ne peuvent pas être partagées. Examinez filtres et contenu visible avant publication. Choisissez un lien public secret ou la protection par mot de passe si elle est proposée ; le mot de passe exige au moins huit caractères. Copiez le lien après le succès du changement.

Ouvrez-le dans une session de navigateur sans votre compte. Inspectez tickets, champs et contenus liés accessibles au visiteur. Le lien donne un accès en lecture à la vue, pas une adhésion ni des droits de modification au projet.

Les cartes partagées exposent leurs titres, descriptions et propriétés affichées : noms des responsables, catégories, noms des objectifs, échéances, récurrences et éventuels liens de forge. La projection exclut le corps des plans d’implémentation et les e-mails des membres. Les indicateurs de parent et de relation peuvent montrer les identifiants de tickets du projet hors des filtres de la vue. Examinez descriptions, noms et identifiants autant que les colonnes visibles ; masquer une propriété de carte n’est pas un outil général de suppression de contenu sensible.

![Dialogue de partage d’une vue avec l’accès privé sélectionné.](/documentation/fr/work-share-view.png)

### Révoquer et vérifier {#revoke-view}

Rendez la vue privée depuis le partage pour révoquer sa publication. Ouvrez de nouveau l’ancien lien anonymement et vérifiez le refus d’accès. La révocation ne rappelle pas les copies ou captures déjà conservées.

Les liens secrets de vues utilisent le circuit de publication privé et restent noindex. Cette politique limite la découverte par les moteurs ; ce n’est pas un mot de passe. Gardez le lien confidentiel si le contenu est sensible et utilisez la protection par mot de passe lorsque nécessaire. Distinguez la vue d’un utilisateur de la documentation officielle indexée.

Si le résultat anonyme est inattendu, contrôlez la vue enregistrée et le partage avant d’envoyer le lien. Revérifiez le périmètre après une modification des filtres ou contenus liés.
