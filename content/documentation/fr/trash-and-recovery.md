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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "content/knowledge/productivity.md",
      "lib/server/trash.ts",
      "components/app-sidebar.tsx"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        994,
        1046
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "trash-and-recovery-steps"
  ]
}
---

## Retrouver et restaurer {#trash-and-recovery}

Ouvrez la corbeille depuis le menu du compte. Elle contient le travail supprimé récupérable : tickets, objectifs, retours, routines, projets et pages pris en charge. Vérifiez type, date et délai restant affichés avant de restaurer.

Restaurez d’abord le parent ou conteneur nécessaire. Par exemple, restaurez la base de données avant une entrée supprimée séparément. Ouvrez ensuite la destination et inspectez contenu et propriétés. Les objets supprimés restent récupérables pendant 30 jours, avant leur suppression définitive par la rétention. Seul le propriétaire peut restaurer ou supprimer définitivement un projet ou une routine. Le propriétaire et les Membres peuvent restaurer ou supprimer les autres objets pris en charge du projet tant qu’ils y ont accès. Un Lecteur ne peut pas modifier un projet : les éléments d’un projet que vous ne faites que lire n’apparaissent donc pas dans votre corbeille.

![Ticket de démonstration récupérable avec trente jours restants dans la corbeille.](/documentation/fr/reader-trash.png)

## Suppression définitive et récupération échouée {#permanent-removal}

Supprimer définitivement ou vider la corbeille est irréversible. Lisez confirmation et nombre d’éléments ; ces actions ne servent pas à masquer simplement du travail terminé. Après le délai de conservation disponible, l’objet peut ne plus être récupérable dans l’interface.

Si la restauration échoue, lisez l’erreur et vérifiez que projet ou parent existe et reste accessible. Ne purgez ou ne recréez pas plusieurs fois pour résoudre un conflit. Exportez les données importantes avant une suppression du compte ; ses conséquences diffèrent de la mise d’un objet dans la corbeille récupérable.
