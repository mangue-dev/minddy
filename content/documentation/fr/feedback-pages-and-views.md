---
{
  "id": "feedback-pages-and-views",
  "locale": "fr",
  "title": "Ajouter pages et vues publiques au tableau",
  "summary": "Sélectionner du contenu publié sans exposer noms ou liens protégés.",
  "topic": "Retours et demandes",
  "type": "guide",
  "audiences": [
    "owner",
    "visitor"
  ],
  "workflows": [
    "F05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/project-feedback-settings.tsx",
      "components/feedback/feedback-settings-shared.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/public-nav.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/feedback-pages-and-views-workflow.png",
      "alt": "Guide des retours publié, sélectionné dans la navigation du board et lisible sans connexion.",
      "caption": "Publiez une page, activez les onglets de pages et sélectionnez-la pour le board. Cette page de démonstration a été ouverte anonymement ; son URL opaque conserve noindex.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        650
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "feedback-pages-and-views-workflow"
  ]
}
---

## Publier et sélectionner {#feedback-pages-and-views}

En tant que propriétaire du projet, publiez d’abord la page souhaitée ou partagez la vue souhaitée avec une visibilité publique. Vérifiez l’absence d’informations privées. Ouvrez les réglages Retours, activez la famille des pages ou des vues et sélectionnez chaque élément à afficher. L’interrupteur de la famille et la sélection de chaque élément sont tous deux nécessaires.

La liste des réglages peut contenir des partages protégés, mais la navigation publique n’inclut que les partages de niveau public. Sélectionner une page protégée ne contourne pas sa protection et n’expose pas son nom dans un onglet du board. Un élément publié dans un autre projet ne fait pas partie des onglets de ce projet.


## Vérifier et retirer l’accès {#visibility}

Ouvrez le board déconnecté. Suivez ses onglets vers les vues et pages sélectionnées et vérifiez leurs titres et leurs contenus. Lorsqu’elle est configurée, la navigation est commune au board, aux vues publiques et aux pages publiques ; un onglet isolé n’est pas affiché comme navigation.

Pour retirer un onglet, désélectionnez l’élément ou désactivez sa famille. Cela retire la navigation, pas le partage sous-jacent. Révoquez ou modifiez le partage lui-même pour supprimer l’accès par lien direct. Désactiver le board désactive aussi sa navigation associée, sans révoquer indépendamment tous les partages de pages et de vues. Après une modification de publication, vérifiez l’onglet du board et l’URL du partage d’origine.

![Guide des retours publié, sélectionné dans la navigation du board et lisible sans connexion.](/documentation/fr/feedback-pages-and-views-workflow.png)
