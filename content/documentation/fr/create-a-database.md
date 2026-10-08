---
{
  "id": "create-a-database",
  "locale": "fr",
  "title": "Créer une base et ses colonnes",
  "summary": "Partez d’une liste vide, choisissez les propriétés et ajoutez une première entrée.",
  "topic": "Pages et bases de données",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P08"
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
      "content/knowledge/pages.md",
      "components/pages/database-setup-banner.tsx",
      "components/pages/database-property-dialogs.tsx",
      "lib/page-creation-settlement.ts"
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
    "database-cells-and-entries",
    "import-a-database"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/database-property-types.png",
      "alt": "Sélecteur de type de colonne : texte, nombre, sélections, dates, personnes et case à cocher.",
      "caption": "Choisissez un type adapté aux valeurs à conserver.",
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
    "create-a-database-steps"
  ]
}
---

## Créer la liste {#create-a-database}

Comme membre, ouvrez les pages, utilisez + et choisissez une base de données. Elle commence avec le nom des entrées, sans colonne optionnelle. Sa bannière propose une création avec Numo ou l’import d’une base existante. La configuration manuelle reste disponible sans IA. Choisir la création avec Numo ouvre une demande préparée avec cette base comme contexte de page, après confirmation de sa création. Relisez et envoyez la demande pour décrire la structure souhaitée ; ouvrir la conversation ne termine pas la configuration. Le travail IA nécessite un fournisseur configuré et un budget disponible ou une clé personnelle compatible. Inspectez le schéma et les entrées obtenus avant de vous y fier.

Ouvrez Colonnes et ajoutez une colonne, ou utilisez + à droite du tableau. Nommez-la et choisissez Texte, Nombre, Sélection, Sélection multiple, Date de création, Date, Personnes ou Case à cocher. Le sélecteur de types est recherchable. Enregistrez, ajoutez une entrée et vérifiez la colonne dans la liste et la page d’entrée.

## Types et limites {#database-types}

Une base accepte 30 colonnes de propriétés en plus du nom. Sélection autorise une option, Sélection multiple plusieurs, avec 100 options maximum par colonne. Une cellule texte accepte 2 000 caractères. Nombre accepte les décimaux signés avec point ou virgule et refuse les lettres. La date de création est l’horodatage initial et ne se modifie pas.

Personnes sélectionne les membres du projet, pas des e-mails arbitraires. Les membres nouvellement mentionnés peuvent être notifiés. Chaque entrée est aussi une page avec contenu, commentaires et pièces jointes.

Formules avancées, automatisations et vues supplémentaires ne sont pas disponibles. Utilisez une propriété texte ou un document lié si les données ne correspondent pas à un type proposé ; ne présentez pas une formule non prise en charge comme une colonne fonctionnelle.


![Sélecteur de type de colonne : texte, nombre, sélections, dates, personnes et case à cocher.](/documentation/fr/database-property-types.png)
