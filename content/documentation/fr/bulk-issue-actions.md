---
{
  "id": "bulk-issue-actions",
  "locale": "fr",
  "title": "Modifier plusieurs tickets ensemble",
  "summary": "Vérifiez la sélection avant d’appliquer une même action à tous ses tickets.",
  "topic": "Projets et tickets",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W04"
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
      "components/bulk-issue-actions.tsx",
      "components/global-board.tsx",
      "components/issue-card.tsx",
      "components/marquee-selection.tsx",
      "components/command-palette.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "views-and-filters",
    "personal-cycle"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "bulk-issue-actions-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-bulk-actions.png",
      "alt": "Menu d’actions pour deux tickets de démonstration sélectionnés.",
      "caption": "Le menu agit sur les tickets sélectionnés. Aucune modification groupée n’a été envoyée sur cette capture.",
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
    "bulk-issue-actions-steps"
  ]
}
---

## Sélectionner et agir {#bulk-issue-actions}

Dans un tableau, maintenez Maj et cliquez sur chaque carte pour l’ajouter à la sélection ou l’en retirer. Avec une souris, vous pouvez aussi tracer un rectangle depuis une zone vide du tableau ; Maj, Commande ou Ctrl ajoute cette zone à la sélection existante. Le rectangle n’est pas un mode de sélection tactile. Vérifiez le nombre choisi et les identifiants visibles avant d’ouvrir les actions groupées. La sélection est l’ensemble ciblé par l’action, pas une vue enregistrée ni une autorisation supplémentaire.

Choisissez Actions dans la barre flottante de sélection pour ouvrir la palette de commandes. Choisissez l’état, la priorité, l’effort ou le responsable, définissez la valeur et validez le formulaire intégré. L’action sur l’objectif apparaît seulement pour une sélection appartenant à un projet avec des objectifs disponibles. Les autres actions, comme ajouter ou retirer des tickets du cycle, lier deux tickets ou confier la sélection à Numo, apparaissent selon les capacités du tableau courant. Inspectez ensuite les tickets concernés. Sur un appareil uniquement tactile sans geste de sélection multiple pris en charge, modifiez les tickets un par un dans leur panneau de détail.

![Menu d’actions pour deux tickets de démonstration sélectionnés.](/documentation/fr/work-bulk-actions.png)

## Résultats partiels et suppression {#bulk-results}

Pour plusieurs projets, vérifiez votre adhésion à chacun. Lisez les échecs partiels : certaines modifications peuvent déjà être enregistrées alors qu’un autre ticket a été refusé. Inspectez le résultat avant de réessayer toute la sélection.

La suppression touche chaque élément sélectionné ; confirmez donc l’ensemble avant de poursuivre. Effacez la sélection avant de passer à un autre travail. Un changement peut retirer des tickets de la vue filtrée sans les supprimer du projet. Recherchez leurs identifiants pour vérifier l’état obtenu plutôt que de les recréer.
