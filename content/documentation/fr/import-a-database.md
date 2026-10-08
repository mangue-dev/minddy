---
{
  "id": "import-a-database",
  "locale": "fr",
  "title": "Importer une base et le contenu de ses entrées",
  "summary": "Examinez la correspondance du schéma et le nombre de pages avant de remplir une base vide.",
  "topic": "Pages et bases de données",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P11"
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
      "components/pages/database-import-dialog.tsx",
      "lib/server/database-import.ts",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-a-database",
    "change-a-database-schema",
    "import-export-and-print-pages"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/database-import-review.png",
      "alt": "Vérification d’un CSV local : deux pages d’entrées et deux colonnes, avec le bouton Importer la base.",
      "caption": "Vérifiez les entrées analysées et le nombre de colonnes avant l’import dans la base vide.",
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
    "import-a-database-steps"
  ]
}
---

## Choisir l’import {#import-a-database}

Créez une base sans colonnes optionnelles ni entrées. Depuis sa bannière, choisissez l’import d’une base existante. Envoyez un ZIP Notion Markdown & CSV avec sous-pages, un CSV de base ou une archive Minddy. Si l’archive contient plusieurs bases, choisissez celle à importer.

Vérifiez noms et types suggérés, puis le nombre de pages avant confirmation. Numo peut proposer les types à partir d’un petit échantillon si l’assistance est configurée ; la correspondance manuelle reste disponible. Une propriété source non prise en charge reste du texte. Les valeurs incompatibles bloquent l’import au lieu d’être effacées silencieusement.

## Contenu conservé et contrôles {#database-import-result}

L’import comprend corps des entrées, documents imbriqués et fichiers locaux présents dans l’archive. Une archive Minddy conserve aussi schéma exact et couleurs et réassocie les liens internes de pages et fichiers. Les personnes peuvent être associées aux membres du projet cible. L’export Notion ne contient ni schéma original, ni couleurs d’options, ni définitions de formules ; l’import ne récupère pas une information absente.

Les limites sont 20 Mo compressés, 50 Mo décompressés et 1 000 pages. Chaque fichier garde la limite de 10 Mo. L’écriture en base est transactionnelle. Réessayer la même tentative dans le dialogue ouvert conserve son identifiant de requête : une tentative déjà terminée est retournée sans dupliquer les lignes. Charger un autre fichier ou rouvrir un dialogue peut créer une nouvelle tentative. Après un résultat réseau incertain, inspectez la destination avant de recommencer ; une base déjà remplie ne répond plus au prérequis de destination vide.

Après succès, inspectez entrées, valeurs, sous-pages et fichiers. Gardez l’archive originale jusque-là. En cas d’échec, lisez la première erreur et corrigez format ou correspondance. Ne remplissez pas manuellement la destination en supposant qu’elle répond encore à l’exigence de base vide.


![Vérification d’un CSV local : deux pages d’entrées et deux colonnes, avec le bouton Importer la base.](/documentation/fr/database-import-review.png)
