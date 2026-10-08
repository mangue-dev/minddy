---
{
  "id": "change-a-database-schema",
  "locale": "fr",
  "title": "Modifier le schéma d’une base sans perdre de données",
  "summary": "Renommez, réordonnez ou convertissez des colonnes en examinant les pertes de valeurs annoncées.",
  "topic": "Pages et bases de données",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P10"
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
      "components/pages/database-property-dialogs.tsx",
      "components/pages/database-column-name.tsx",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "create-a-database",
    "database-cells-and-entries",
    "import-a-database"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "change-a-database-schema-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/database-conversion-warning.png",
      "alt": "Avertissement de conversion : passer de Texte à Nombre efface une cellule incompatible, avec boutons Annuler et confirmation.",
      "caption": "Vérifiez le nombre réel de cellules incompatibles avant de confirmer. Annuler conserve les valeurs actuelles.",
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
    "change-a-database-schema-steps"
  ]
}
---

## Disposition et options {#change-a-database-schema}

Dans Colonnes, l’œil montre ou masque une propriété. Cliquez sur un en-tête pour renommer ou faites-le glisser pour réordonner ; le nom reste en première position. Les options de sélection simple ou multiple se modifient depuis la cellule ou Colonnes ; noms et couleurs s’enregistrent ensemble.

Masquer change l’affichage, sans supprimer les valeurs. Supprimer une colonne personnalisée retire ses valeurs de chaque entrée et ne peut pas être annulé. Lisez cette conséquence avant confirmation.

## Convertir le type {#convert-column}

Choisissez la modification d’une colonne personnalisée et son nouveau type. Le dialogue convertit les valeurs lors de l’enregistrement. Si certaines sont incompatibles, l’avertissement indique combien seront effacées. Continuez uniquement si cette perte est acceptable, ou annulez pour garder type et valeurs.

Passer à la date de création utilise la date initiale de chaque entrée et avertit avant remplacement. Après conversion, inspectez des exemples, notamment lorsqu’un nombre, une sélection ou une date peut changer d’interprétation.

Les agents modifient le schéma avec la révision courante et un jeton de prévisualisation. Un changement concurrent invalide cette prévisualisation. Relisez et prévisualisez de nouveau au lieu de forcer une ancienne conversion ; effacer les valeurs incompatibles nécessite une confirmation explicite.


![Avertissement de conversion : passer de Texte à Nombre efface une cellule incompatible, avec boutons Annuler et confirmation.](/documentation/fr/database-conversion-warning.png)
