---
{
  "id": "page-history",
  "locale": "fr",
  "title": "Inspecter et restaurer une version de page",
  "summary": "Prévisualisez l’historique enregistré avant de remplacer le document actuel.",
  "topic": "Pages et bases de données",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "components/pages/page-history.tsx",
      "lib/server/page-versions.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "create-and-organize-pages",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-history-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/page-history-preview.png",
      "alt": "Onglet Versions avec un état antérieur déplié, son auteur, Restaurer et l’indication de conservation pendant 30 jours.",
      "caption": "Prévisualisez un état enregistré et comparez-le à la page actuelle avant de le restaurer.",
      "revision": 2,
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
    "page-history-steps"
  ]
}
---

## Consulter les versions {#page-history}

Ouvrez l’indicateur d’enregistrement ou d’historique pour les versions, ou les commentaires et l’activité pour les actions. Ces onglets répondent à des questions différentes : une version est un état du document, tandis que l’activité comprend aussi renommage, suppression ou restauration sans le même instantané.

Choisissez une version et prévisualisez-la. L’historique identifie les auteurs et les agents ; comparez le contenu avec la modification à annuler. L’interface annonce une fenêtre de 30 jours ; ce n’est pas une sauvegarde externe permanente.

## Restaurer et vérifier {#restore-page-version}

En tant que membre autorisé, restaurez uniquement après avoir examiné le contenu actuel qui sera remplacé. L’état juste avant restauration entre lui-même dans l’historique et peut être récupéré tant qu’il est conservé.

Rouvrez ou actualisez l’éditeur et vérifiez le corps réel. Un éditeur resté ouvert contient une version périmée et ne doit pas écraser aveuglément la restauration. Les versions ne sont pas des sauvegardes d’instance : les octets des pièces jointes, les fichiers supprimés et les objets liés peuvent suivre d’autres cycles. Consultez les guides fichiers et récupération d’instance lorsque l’information manque hors du corps du document.


![Onglet Versions avec un état antérieur déplié, son auteur, Restaurer et l’indication de conservation pendant 30 jours.](/documentation/fr/page-history-preview.png)
