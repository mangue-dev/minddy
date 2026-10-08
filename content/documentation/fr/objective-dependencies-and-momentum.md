---
{
  "id": "objective-dependencies-and-momentum",
  "locale": "fr",
  "title": "Interpréter les dépendances et la dynamique d’un objectif",
  "summary": "Lisez les blocages et les signaux d’activité sans transformer une estimation en garantie.",
  "topic": "Projets et tickets",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W11"
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
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "content/knowledge/core-tracker.md",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "objectives",
    "issue-dependencies",
    "personal-statistics"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "objective-dependencies-and-momentum-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/reader-objective-momentum.png",
      "alt": "Élan d’un objectif après la clôture réelle d’un ticket de démonstration.",
      "caption": "Consultez l’élan avec le travail associé. L’historique disponible ne suffit pas à afficher une date de fin estimée.",
      "revision": 2,
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
    "objective-dependencies-and-momentum-steps"
  ]
}
---

## Examiner relations et blocages {#objective-dependencies-and-momentum}

Ouvrez les relations de l’objectif. Vérifiez quel résultat dépend d’un autre et consultez les dépendances de tickets qui expliquent une contrainte. Hiérarchie, association et blocage répondent à des questions différentes ; inspectez le sens avant de modifier la relation.

Une relation de blocage peut relier un ticket ou un autre objectif à cet objectif, dans le même projet. Ses tickets membres ouverts héritent du blocage non résolu : l’affichage identifie le vrai préalable et l’objectif qui le transmet. Ce n’est pas une nouvelle relation directe enregistrée sur chaque ticket. Clôturer le ticket ou l’objectif bloquant, ou l’objectif bloqué, ou retirer un ticket de cet objectif, supprime le blocage hérité correspondant. Résolvez le vrai préalable ou corrigez une relation obsolète. Modifier la date cible d’un objectif ne termine pas ses tickets bloquants.

## Interpréter le signal de dynamique {#momentum}

La dynamique résume le travail récemment terminé. Elle peut accélérer, rester stable, ralentir ou stagner, avec des états distincts pour les objectifs non démarrés, terminés et annulés. Utilisez ce signal pour repérer un résultat qui mérite votre attention, puis consultez tickets et activité.

Une estimation de fin exige au moins deux réalisations, une semaine complète d’observation, un effort réalisé positif et du travail restant. Seuls les tickets actuellement associés contribuent ; une réalisation antérieure à la création de l’objectif ne fabrique pas une dynamique récente. Avec une date cible valide, l’historique va de la création à cette date et le débit utilise le temps observé depuis la création, y compris après une échéance dépassée. Sans date cible valide, le calcul utilise huit semaines d’historique glissant et une fenêtre de prévision de 28 jours. Un historique limité ou un changement récent de périmètre la rend moins utile. Ce n’est pas une date promise, et elle ne comprend pas le travail non associé. Comparez date cible, tâches restantes et contraintes réelles avant de changer vos engagements.

![Élan d’un objectif après la clôture réelle d’un ticket de démonstration.](/documentation/fr/reader-objective-momentum.png)
