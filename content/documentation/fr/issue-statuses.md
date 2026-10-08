---
{
  "id": "issue-statuses",
  "locale": "fr",
  "title": "Faire évoluer l’état d’un ticket",
  "summary": "Distinguez réception, travail prévu, revue et résultat terminal avec les états fixes.",
  "topic": "Projets et tickets",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W02"
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
      "content/knowledge/core-tracker.md",
      "components/kanban-board.tsx",
      "components/issue-context-menu.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "triage-incoming-work",
    "issue-dependencies",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/issue-statuses.png",
      "alt": "Les huit statuts du ticket dans le sélecteur, avec Backlog sélectionné.",
      "caption": "La coche indique le statut actuel. Choisissez celui qui reflète l’état réel du travail.",
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
    "issue-statuses-steps"
  ]
}
---

## Changer l’état {#issue-statuses}

Ouvrez le sélecteur d’état du ticket ou les actions d’état du tableau. En kanban, déplacer une carte entre colonnes modifie le ticket ; changer un filtre modifie seulement l’affichage. Vérifiez le nouvel état dans le panneau de détail.

| État | Usage |
| --- | --- |
| Triage | Travail entrant à examiner. |
| Backlog | Travail retenu, pas encore choisi pour démarrer. |
| À faire | Travail sélectionné à effectuer. |
| En cours | Travail commencé. |
| En revue | Implémentation en attente de relecture. |
| Terminé | Résultat attendu accompli. |
| Annulé | Travail clôturé sans livraison. |
| Doublon | Travail représenté par un autre ticket. |

Les états sont fixes et ne se personnalisent pas par projet. Triage et doublon existent dans les sélecteurs, mais sont volontairement absents des colonnes kanban ordinaires. Une colonne absente ne signifie pas que l’état ou le ticket n’existe pas.


![Les huit statuts du ticket dans le sélecteur, avec Backlog sélectionné.](/documentation/fr/issue-statuses.png)

## États terminaux et vérification {#closed-work}

Terminé, annulé et doublon sont terminaux pour le suivi : ils ne bloquent plus leurs dépendants et sortent des comptes actifs. Annulé ne signifie pas livré. Pour un doublon, indiquez le ticket conservé afin de donner une destination claire aux discussions et au progrès.

Vérifiez les filtres si un ticket disparaît après clôture. Ouvrez-le par identifiant pour inspecter le résultat et corriger une clôture accidentelle. Pour un travail bloqué, contrôlez aussi le sens de la dépendance : un changement d’état ne réécrit ni description ni plan.
