---
{
  "id": "issue-dependencies",
  "locale": "fr",
  "title": "Lier dépendances et tickets associés",
  "summary": "Exprimez quel travail en bloque un autre et distinguez relation et hiérarchie.",
  "topic": "Projets et tickets",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W05"
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
      "content/knowledge/core-tracker.md",
      "components/issue-side-panel.tsx",
      "components/issue-indicators.tsx",
      "captures/shots/relations/intent.md",
      "lib/server/issue-relations.ts",
      "lib/relation-constants.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "sub-issues",
    "issue-statuses",
    "objective-dependencies-and-momentum"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-dependencies-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-dependencies.png",
      "alt": "Recherche d’un préalable par identifiant de ticket.",
      "caption": "Choisissez le sens de la relation avant sa destination. Aucune relation n’a été envoyée dans ce sélecteur.",
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
    "issue-dependencies-steps"
  ]
}
---

## Choisir la relation et son sens {#issue-dependencies}

Ouvrez les relations du ticket et recherchez l’autre par titre ou identifiant. Choisissez une relation de blocage lorsqu’une tâche doit finir avant qu’une autre puisse avancer. Si A bloque B, A est le préalable et B est bloqué par A. Une relation associée ajoute du contexte sans imposer cet ordre.

Lisez les deux identifiants et le sens affiché avant de confirmer. Par exemple, « Préparer le point d’accès » bloque « Connecter le client », pas l’inverse. Une dépendance ne transforme pas un ticket en sous-ticket, et la relation parent-enfant ne remplace pas un blocage.

![Recherche d’un préalable par identifiant de ticket.](/documentation/fr/work-dependencies.png)

## Blocages résolus ou hérités {#blocker-state}

Les états terminaux terminé, annulé et doublon cessent de bloquer le travail. Une relation relie des tickets ou objectifs du même projet ; ses deux extrémités doivent y être accessibles. Elle ne relie pas arbitrairement du travail privé de plusieurs projets et ne publie aucun des objets.

Un ticket ouvert peut hériter d’un blocage par son objectif ouvert. Si A bloque l’objectif B, les tickets ouverts rattachés à B affichent A comme blocage hérité, sans relation directe entre A et chaque ticket. L’affichage nomme le vrai blocage et l’objectif à l’origine de l’héritage. Inspectez cette relation d’objectif avant de chercher à la dissocier du ticket. Clôturer A, clôturer B ou retirer le ticket de B supprime ce blocage hérité. Le mécanisme suit l’appartenance à l’objectif, pas la hiérarchie parent/sous-ticket.

Retirez une relation devenue inexacte depuis ses commandes, puis vérifiez son libellé et l’indicateur de blocage. Marquer un doublon modifie son cycle de vie et désigne le travail conservé ; une simple relation associée ne clôture pas le doublon.

Si le sélecteur ne trouve pas un ticket, vérifiez son identifiant et l’accès au projet. Ne révélez pas un autre projet en copiant son lien privé dans une réponse publique à un retour.
