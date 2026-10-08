---
{
  "id": "share-a-view",
  "locale": "fr",
  "title": "Partager une vue et révoquer son lien",
  "summary": "Publiez le bon sous-ensemble de tickets sans donner une adhésion au projet.",
  "topic": "Planifier et retrouver le travail",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W14"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "app/api/views/[id]/share/route.ts",
      "app/share/[token]/page.tsx",
      "content/knowledge/feedback.md",
      "lib/server/view-shares.ts",
      "components/board-toolbar.tsx",
      "lib/public-board-projection.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "views-and-filters",
    "publish-a-page",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "share-a-view-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-share-view.png",
      "alt": "Dialogue de partage d’une vue avec l’accès privé sélectionné.",
      "caption": "Les accès privé, protégé par mot de passe et public correspondent à trois choix distincts. Cette vue reste privée sur la capture.",
      "revision": 2,
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
    "share-a-view-steps"
  ]
}
---

## Publier la vue {#share-a-view}

Ouvrez le menu de la vue dans un tableau de projet éligible et choisissez Partager la vue. Vous devez avoir accès au projet ; une vue personnelle de ce projet peut être partagée seulement par son utilisateur. Les vues globales couvrant plusieurs projets ne peuvent pas être partagées. Examinez filtres et contenu visible avant publication. Choisissez un lien public secret ou la protection par mot de passe si elle est proposée ; le mot de passe exige au moins huit caractères. Copiez le lien après le succès du changement.

Ouvrez-le dans une session de navigateur sans votre compte. Inspectez tickets, champs et contenus liés accessibles au visiteur. Le lien donne un accès en lecture à la vue, pas une adhésion ni des droits de modification au projet.

Les cartes partagées exposent leurs titres, descriptions et propriétés affichées : noms des responsables, catégories, noms des objectifs, échéances, récurrences et éventuels liens de forge. La projection exclut le corps des plans d’implémentation et les e-mails des membres. Les indicateurs de parent et de relation peuvent montrer les identifiants de tickets du projet hors des filtres de la vue. Examinez descriptions, noms et identifiants autant que les colonnes visibles ; masquer une propriété de carte n’est pas un outil général de suppression de contenu sensible.

![Dialogue de partage d’une vue avec l’accès privé sélectionné.](/documentation/fr/work-share-view.png)

## Révoquer et vérifier {#revoke-view}

Rendez la vue privée depuis le partage pour révoquer sa publication. Ouvrez de nouveau l’ancien lien anonymement et vérifiez le refus d’accès. La révocation ne rappelle pas les copies ou captures déjà conservées.

Les liens secrets de vues utilisent le circuit de publication privé et restent noindex. Cette politique limite la découverte par les moteurs ; ce n’est pas un mot de passe. Gardez le lien confidentiel si le contenu est sensible et utilisez la protection par mot de passe lorsque nécessaire. Distinguez la vue d’un utilisateur de la documentation officielle indexée.

Si le résultat anonyme est inattendu, contrôlez la vue enregistrée et le partage avant d’envoyer le lien. Revérifiez le périmètre après une modification des filtres ou contenus liés.
