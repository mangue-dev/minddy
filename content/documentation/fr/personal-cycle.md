---
{
  "id": "personal-cycle",
  "locale": "fr",
  "title": "Cycles personnels",
  "summary": "Choisissez du travail dans plusieurs projets pour une semaine ou une quinzaine.",
  "topic": "Planifier et retrouver le travail",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W12"
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
      "content/knowledge/productivity.md",
      "components/cycle/cycle-header.tsx",
      "components/settings/account-cycles-section.tsx",
      "lib/cycle-prefs.ts",
      "lib/server/cycles.ts",
      "components/cycle/use-cycle-menu-actions.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "views",
    "issues"
  ],
  "aliases": [],
  "tags": [
    "Planifier votre cycle personnel"
  ],
  "figures": [
    {
      "id": "personal-cycle-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/reader-cycle.png",
      "alt": "Ticket de démonstration dans le backlog du cycle personnel.",
      "caption": "L’ajout à ce cycle a attribué le ticket au propriétaire du cycle tout en conservant l’état backlog.",
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
    "personal-cycle-steps"
  ]
}
---

## Configurer et remplir votre cycle {#personal-cycle}

Activez les cycles dans Réglages du compte → Cycles, puis ouvrez Cycle depuis la navigation personnelle. Il appartient à votre compte et peut contenir des tickets de plusieurs projets auxquels vous avez accès. Ce n’est pas un sprint de projet et il n’appartient pas à un objectif d’équipe.

Choisissez une durée d’une ou deux semaines, le jour de début, un à quatre cycles à venir et une intensité légère, moyenne ou élevée. Ces réglages définissent votre période personnelle et sa capacité cible. Les options de capture automatique déterminent si les tickets qui vous sont attribués entrent dans le cycle courant lorsqu’ils démarrent ou se terminent.

Le cycle courant est rempli automatiquement une fois à partir du travail éligible. Pour ajouter un ticket manuellement, utilisez l’action de cycle dans son menu et choisissez la période courante ou suivante si elle est disponible. L’ajout attribue le ticket au propriétaire du cycle sans changer son état. Les tickets en triage, terminés, annulés ou doublons ne peuvent pas être ajoutés par cette action. Vérifiez le responsable et les blocages après l’ajout ; retirer un ticket du cycle le conserve dans son projet.

![Ticket de démonstration dans le backlog du cycle personnel.](/documentation/fr/reader-cycle.png)

## Terminer ou ajuster la période {#cycle-results}

Mettez à jour les états des tickets et comparez le travail terminé au travail restant. Au changement de période, les tickets éligibles non terminés des anciens cycles passent automatiquement dans le cycle courant, en gardant leur responsable. Ce report ne les marque pas comme terminés. Le sélecteur de dates permet de consulter les cycles passés et à venir : ces vues sont en lecture seule, tandis que le cycle courant permet les modifications.

Si un prérequis est ajouté au cycle courant pour garder des dépendances cohérentes, examinez la raison avant de le retirer. Un ticket disparu après sa clôture peut rester visible dans le travail terminé ou par son identifiant. Les réglages de votre cycle concernent votre planification, pas le cycle personnel d’un autre membre.
