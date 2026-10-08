---
{
  "id": "import-issues",
  "locale": "fr",
  "title": "Importer un backlog CSV après contrôle",
  "summary": "Vérifier colonnes, personnes, statuts et parents avant de créer les tickets.",
  "topic": "Compte et applications",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "A06"
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
      "components/settings/csv-import-panel.tsx",
      "components/settings/import-mapping-editor.tsx",
      "lib/use-csv-import.ts",
      "lib/import/types.ts",
      "lib/server/import-issues.ts",
      "content/documentation/reviews/csv-preview-capture-candidates.json"
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
      "id": "import-issues-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/import-issues-preview-workflow.png",
      "alt": "Aperçu CSV de deux lignes de démonstration localisées et des colonnes détectées.",
      "caption": "Aperçu CSV de deux lignes de démonstration localisées et des colonnes détectées. Aucun import n’a été lancé ; la préparation IA optionnelle a été bloquée pour la capture.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "import-issues-workflow"
  ]
}
---

## Préparer et prévisualiser {#import-issues}

Le propriétaire ouvre Import dans les réglages du projet et choisit un export CSV. Les formats de Linear et Jira sont détectés ; les autres CSV utilisent une correspondance générique. Chaque import est limité à 5 MiB et 5 000 tickets. Découpez un export plus grand de manière organisée et conservez, lorsque possible, les références aux parents dans le même lot.

Associez la colonne du titre avant d’importer. Examinez les correspondances de description, état, priorité, effort, échéance, catégories et responsables. Associez les personnes à des membres réels du projet et vérifiez les nouvelles catégories. Les références aux parents correspondent aux clés externes du lot et prennent en charge un seul niveau. Les CSV n’importent pas les octets des fichiers joints.

Une proposition IA n’est demandée que pour les correspondances manquantes. Elle reste modifiable ; un fournisseur indisponible ou en échec laisse utilisable la correspondance manuelle. Une correction manuelle empêche une proposition tardive d’écraser vos choix.


## Importer et contrôler {#result}

Après chaque modification des correspondances, lisez le nombre de tickets, la répartition des états et les avertissements. Corrigez les lignes ignorées ou invalides avant de confirmer. L’import crée de nouveaux tickets ; ne supposez pas que renvoyer le fichier effectue une mise à jour qui élimine les doublons. Après réussite, vérifiez des tickets représentatifs, leurs responsables, leurs dates et leurs parents. Si la réponse est perdue, examinez le projet avant de renvoyer le fichier entier pour éviter le travail en double.

![Aperçu CSV de deux lignes de démonstration localisées et des colonnes détectées.](/documentation/fr/import-issues-preview-workflow.png)
