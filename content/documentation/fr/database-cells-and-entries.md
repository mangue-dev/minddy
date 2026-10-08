---
{
  "id": "database-cells-and-entries",
  "locale": "fr",
  "title": "Modifier les cellules et pages d’une base",
  "summary": "Enregistrez des valeurs, sélectionnez des lignes et agrandissez une entrée sans perdre les changements en attente.",
  "topic": "Pages et bases de données",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P09"
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
      "components/pages/page-database-view.tsx",
      "components/pages/database-cell-editor.tsx",
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
    "change-a-database-schema",
    "create-a-database",
    "page-history"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/database-entry.png",
      "alt": "Entrée de démonstration avec description, durée 2.5, case cochée et sélection vide.",
      "caption": "Ouvrez une entrée pour lire son texte complet et modifier les valeurs typées.",
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
    "database-cells-and-entries-steps"
  ]
}
---

## Modifier une valeur {#database-cells-and-entries}

Cliquez dans une cellule ou sur une propriété au-dessus du corps de l’entrée. Entrée enregistre, Échap annule, Maj+Entrée ajoute une ligne au texte. Quitter l’éditeur enregistre. Un nombre invalide le garde ouvert jusqu’à correction ; un échec de sauvegarde rétablit la valeur et affiche une erreur.

Le champ Sélection permet de choisir une option ; Sélection multiple permet d’en choisir plusieurs. Recherchez une option ou créez-la dans le menu. Ouvrez la modification des options pour renommer ou recolorer, puis enregistrez ensemble ou annulez. Les champs Date, Personnes et Case à cocher ont leurs propres commandes ; la date de création reste en lecture seule.

## Ouvrir, sélectionner et insérer {#entry-actions}

Ouvrez une entrée dans le panneau flottant. Agrandir l’ouvre en page entière une fois les sauvegardes en attente terminées. En cas d’échec, le panneau reste ouvert pour permettre la correction. Une entrée vide reste dans la base jusqu’à suppression.

Les cases des lignes permettent de sélectionner les entrées ; Maj-clic sélectionne une plage. La poignée ouvre les actions et réordonne en ordre manuel. Le + de marge insère en dessous ; Option/Alt permet de l’insérer au-dessus. L’insertion adjacente rétablit l’ordre manuel et enlève les filtres pour montrer la nouvelle entrée.

## Préférences d’affichage {#database-display}

Recherchez, filtrez, classez et masquez les colonnes dans l’unique vue liste. Ces choix restent sur l’appareil ; l’ordre manuel est partagé avec l’arbre. Faites défiler horizontalement avec le pavé tactile, Maj et molette, le toucher ou la barre inférieure. Un aperçu tronqué ne raccourcit pas la valeur stockée. Une entrée avec des valeurs peut se réordonner dans sa base, mais pas sortir de celle-ci.


![Entrée de démonstration avec description, durée 2.5, case cochée et sélection vide.](/documentation/fr/database-entry.png)
