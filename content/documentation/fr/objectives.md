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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 development (MIN-671)",
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
      "lib/objective-momentum.ts",
      "content/documentation/reviews/min-671-objective-momentum-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root (MIN-671 target-date condition and retained calculation claims checked against source and render tests; earlier procedural evidence retained)",
    "language": "agent:/root (fr changed-passage review against English revision 7; earlier unchanged prose reviews retained)",
    "date": "2026-10-10"
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
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        330
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "objectives-steps"
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

Le panneau Élan apparaît uniquement si l’objectif a une date cible. Supprimer cette date masque le panneau, y compris l’historique, les statistiques de rythme et la date de fin estimée. Ajoutez une date cible pour le réafficher ; l’indicateur de progression globale reste disponible sans date cible.

La dynamique résume le travail récemment terminé. Elle peut accélérer, rester stable, ralentir ou stagner, avec des états distincts pour les objectifs non démarrés, terminés et annulés. Utilisez ce signal pour repérer un résultat qui mérite votre attention, puis consultez tickets et activité.

Une estimation de fin exige au moins deux réalisations, une semaine complète d’observation, un effort réalisé positif et du travail restant. Seuls les tickets actuellement associés contribuent ; les réalisations antérieures à la création de l’objectif ne comptent pas dans la dynamique récente.

- Avec une date cible valide, l’historique va de la création à cette date. Le débit utilise le temps observé depuis la création, y compris après une échéance dépassée.
- Si une date cible est renseignée mais ne définit pas une période valide après la création, le calcul utilise huit semaines d’historique glissant et une fenêtre de prévision de 28 jours.

Un historique limité ou un changement récent de périmètre rend l’estimation moins utile. Ce n’est pas une date promise, et elle exclut le travail non associé. Comparez la date cible, les tâches restantes et les contraintes réelles avant de changer vos engagements.
