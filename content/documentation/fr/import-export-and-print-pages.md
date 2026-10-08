---
{
  "id": "import-export-and-print-pages",
  "locale": "fr",
  "title": "Importer, exporter ou imprimer une page",
  "summary": "Choisissez le format et vérifiez contenu, hiérarchie et fidélité des pièces jointes.",
  "topic": "Pages et bases de données",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P07"
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
      "components/pages/page-document-actions.tsx",
      "lib/server/pages-export.ts",
      "components/pages/page-print-view.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "publish-a-page",
    "import-a-database",
    "page-history"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-export-and-print-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/page-export.png",
      "alt": "Menu d’export du document avec Markdown (.md) et Imprimer / PDF.",
      "caption": "Choisissez Markdown pour télécharger le document, ou Imprimer / PDF pour ouvrir la vue imprimable.",
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
    "import-export-and-print-pages-steps"
  ]
}
---

## Choisir l’opération {#import-export-and-print-pages}

Ouvrez le menu du document, puis Exporter. Choisissez Markdown pour une page (.md) ou une branche (.zip), PDF pour ouvrir la vue d’impression, ou l’archive de base lorsque la page est une base de données. Vérifiez le périmètre proposé avant de confirmer : page, branche et archive de base n’ont pas le même contenu.

Ouvrez l’export pour vérifier titres, encadrés, liens et pièces jointes nécessaires au lecteur. L’action PDF ouvre une vue documentaire lisible. Utilisez les commandes d’impression du navigateur pour imprimer ou enregistrer un PDF. Le menu du document ne propose pas d’importation générale ; les imports pris en charge commencent depuis une base vide, selon le guide d’importation des bases.


![Menu d’export du document avec Markdown (.md) et Imprimer / PDF.](/documentation/fr/page-export.png)

## Archives de bases et limites {#export-fidelity}

L’archive de base (.zip) comprend la branche : Markdown et CSV, schéma exact et couleurs des options, valeurs, corps, dates de création, sous-pages et octets des fichiers. Importez-la dans une nouvelle base vide pour restaurer la structure. Filtres, classement et colonnes masquées propres à l’appareil restent sur l’appareil initial.

L’export ne transfère ni mots de passe, ni identifiants fournisseurs, ni abonnements. Pour déplacer le travail du compte entre instances, consultez le transfert de données. Si un format importé ne conserve pas un bloc ou une propriété externe, vérifiez le résultat avant de remplacer l’original. Ne supprimez pas la source simplement parce qu’un téléchargement existe.
