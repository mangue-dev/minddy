---
{
  "id": "objectives",
  "locale": "fr",
  "title": "Objectifs",
  "summary": "Définissez le résultat d’un projet, rattachez le travail et interprétez la progression, les dépendances et la dynamique.",
  "topic": "Projets et tickets",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W10",
    "W11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
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
      "content/knowledge/core-tracker.md",
      "components/objective-dialog.tsx",
      "components/objective-detail.tsx",
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "issues",
    "personal-cycle",
    "personal-statistics"
  ],
  "aliases": [
    "objective-dependencies-and-momentum"
  ],
  "tags": [
    "Suivre un résultat avec un objectif",
    "Interpréter les dépendances et la dynamique d’un objectif"
  ],
  "figures": [
    {
      "id": "objectives-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/reader-objectives.png",
      "alt": "Dialogue de création d’objectif non envoyé avec un nom de résultat d’exemple.",
      "caption": "Nommez le résultat avant de choisir le responsable, la date cible et l’état. Ce dialogue n’a pas créé un deuxième objectif.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "objective-dependencies-and-momentum-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/reader-objective-momentum.png",
      "alt": "Élan d’un objectif après la clôture réelle d’un ticket de démonstration.",
      "caption": "Consultez l’élan avec le travail associé. L’historique disponible ne suffit pas à afficher une date de fin estimée.",
      "revision": 5,
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
    "objectives-steps",
    "objective-dependencies-and-momentum-steps"
  ]
}
---

Un objectif regroupe les tickets d’un projet autour d’un résultat. Créez-le et associez le travail concerné, puis examinez la progression, les dépendances bloquantes et la dynamique avant de modifier la date cible ou de clôturer l’objectif.

## Suivre un résultat avec un objectif {#objectives}

Ouvrez les objectifs du projet et créez-en un. Nommez le résultat recherché, ajoutez le contexte utile et renseignez les champs disponibles de responsable, date cible, couleur et état. Le responsable suit le résultat ; le choisir ne transfère pas la propriété du projet. Un objectif appartient à un projet ; il diffère du cycle personnel qui couvre plusieurs projets.

Dans les propriétés de chaque ticket concerné, choisissez l’objectif, ou utilisez les commandes de tickets de l’objectif. Vérifiez que le travail voulu apparaît. Ses discussions et ressources conservent les décisions et pages de référence applicables au résultat global.

![Dialogue de création d’objectif non envoyé avec un nom de résultat d’exemple.](/documentation/fr/reader-objectives.png)

### Lire le progrès avant de clôturer {#objective-progress}

Examinez les tickets actifs et terminés avec le progrès de l’objectif. L’indicateur résume le travail associé ; il ne peut pas décider si un résultat produit est satisfaisant. Inspectez les tâches manquantes, les annulations et les doublons avant de terminer l’objectif.

Le cycle de vie distingue résultats prévus, en cours, terminés et annulés. Une date cible est un but ; une prévision est une estimation fondée sur l’activité. Si l’objectif paraît vide, vérifiez les tickets associés et les filtres plutôt que de le recréer. Supprimer un objectif relève de la corbeille récupérable, pas d’un changement d’état ordinaire.

## Interpréter les dépendances et la dynamique d’un objectif {#objective-dependencies-and-momentum}

Ouvrez les relations de l’objectif. Vérifiez quel résultat dépend d’un autre et consultez les dépendances de tickets qui expliquent une contrainte. Hiérarchie, association et blocage répondent à des questions différentes ; inspectez le sens avant de modifier la relation.

Une relation de blocage peut relier un ticket ou un autre objectif à cet objectif, dans le même projet. Ses tickets membres ouverts héritent du blocage non résolu : l’affichage identifie le vrai préalable et l’objectif qui le transmet. Ce n’est pas une nouvelle relation directe enregistrée sur chaque ticket. Clôturer le ticket ou l’objectif bloquant, ou l’objectif bloqué, ou retirer un ticket de cet objectif, supprime le blocage hérité correspondant. Résolvez le vrai préalable ou corrigez une relation obsolète. Modifier la date cible d’un objectif ne termine pas ses tickets bloquants.

### Interpréter le signal de dynamique {#momentum}

La dynamique résume le travail récemment terminé. Elle peut accélérer, rester stable, ralentir ou stagner, avec des états distincts pour les objectifs non démarrés, terminés et annulés. Utilisez ce signal pour repérer un résultat qui mérite votre attention, puis consultez tickets et activité.

Une estimation de fin exige au moins deux réalisations, une semaine complète d’observation, un effort réalisé positif et du travail restant. Seuls les tickets actuellement associés contribuent ; une réalisation antérieure à la création de l’objectif ne fabrique pas une dynamique récente. Avec une date cible valide, l’historique va de la création à cette date et le débit utilise le temps observé depuis la création, y compris après une échéance dépassée. Sans date cible valide, le calcul utilise huit semaines d’historique glissant et une fenêtre de prévision de 28 jours. Un historique limité ou un changement récent de périmètre la rend moins utile. Ce n’est pas une date promise, et elle ne comprend pas le travail non associé. Comparez date cible, tâches restantes et contraintes réelles avant de changer vos engagements.

![Élan d’un objectif après la clôture réelle d’un ticket de démonstration.](/documentation/fr/reader-objective-momentum.png)
