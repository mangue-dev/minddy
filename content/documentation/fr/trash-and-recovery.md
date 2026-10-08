---
{
  "id": "trash-and-recovery",
  "locale": "fr",
  "title": "Corbeille et restauration",
  "summary": "Retrouvez un objet, restaurez ses dépendances et distinguez la suppression définitive.",
  "topic": "Planifier et retrouver le travail",
  "type": "guide",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "W19"
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
      "app/(app)/trash/page.tsx",
      "content/knowledge/productivity.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "pages",
    "accounts",
    "projects"
  ],
  "aliases": [],
  "tags": [
    "Restaurer du travail supprimé"
  ],
  "figures": [
    {
      "id": "trash-and-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/reader-trash.png",
      "alt": "Ticket de démonstration récupérable avec trente jours restants dans la corbeille.",
      "caption": "Les actions de la ligne permettent de restaurer le ticket. Vider la corbeille est une opération permanente distincte.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "trash-and-recovery-steps"
  ]
}
---

## Retrouver et restaurer {#trash-and-recovery}

Ouvrez la corbeille depuis le menu du compte. Elle contient le travail supprimé récupérable : tickets, objectifs, retours, routines, projets et pages pris en charge. Vérifiez type, date et délai restant affichés avant de restaurer.

Restaurez d’abord le parent ou conteneur nécessaire. Par exemple, restaurez la base de données avant une entrée supprimée séparément. Ouvrez ensuite la destination et inspectez contenu et propriétés. Les objets supprimés restent récupérables pendant 30 jours, avant leur suppression définitive par la rétention. Seul le propriétaire peut restaurer ou supprimer définitivement un projet ou une routine. Les membres peuvent agir sur les autres objets pris en charge du projet tant qu’ils y ont accès.

![Ticket de démonstration récupérable avec trente jours restants dans la corbeille.](/documentation/fr/reader-trash.png)

## Suppression définitive et récupération échouée {#permanent-removal}

Supprimer définitivement ou vider la corbeille est irréversible. Lisez confirmation et nombre d’éléments ; ces actions ne servent pas à masquer simplement du travail terminé. Après le délai de conservation disponible, l’objet peut ne plus être récupérable dans l’interface.

Si la restauration échoue, lisez l’erreur et vérifiez que projet ou parent existe et reste accessible. Ne purgez ou ne recréez pas plusieurs fois pour résoudre un conflit. Exportez les données importantes avant une suppression du compte ; ses conséquences diffèrent de la mise d’un objet dans la corbeille récupérable.
