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
      "content/knowledge/productivity.md",
      "components/cycle/cycle-header.tsx",
      "components/settings/account-cycles-section.tsx",
      "lib/cycle-prefs.ts",
      "lib/server/cycles.ts",
      "components/cycle/use-cycle-menu-actions.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/cycle/cycle-empty-states.tsx",
      "components/global-board.tsx"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
    "personal-cycle-steps"
  ]
}
---

## Configurer et remplir votre cycle {#personal-cycle}

Activez les cycles dans **Paramètres du compte** → **Cycles**, ou avec **Activer les cycles** dans l’onglet **Cycle**. Ouvrez cet onglet dans la barre des vues de **Tous les tickets**, ou cherchez Cycle dans la palette de commandes ; l’onglet **Cycle** d’un tableau de projet, marqué d’une flèche, mène au même cycle personnel. Il appartient à votre compte et peut contenir des tickets qui vous sont assignés dans les projets dont vous êtes propriétaire ou Membre. Un lecteur ne peut pas recevoir d’assignation : un projet que vous ne faites que lire n’apporte donc aucun travail. Ce n’est pas un sprint de projet et il n’appartient pas à un objectif d’équipe.

Choisissez une durée d’une ou deux semaines, le jour de début, un à quatre cycles à venir et une intensité légère, moyenne ou élevée. Ces réglages définissent votre période personnelle et sa capacité cible. Les options de capture automatique déterminent si les tickets qui vous sont attribués entrent dans le cycle courant lorsqu’ils démarrent ou se terminent.

Le cycle courant est rempli automatiquement une fois à partir du travail éligible. Pour ajouter un ticket manuellement, utilisez l’action de cycle dans son menu et choisissez la période courante ou suivante si elle est disponible. L’ajout attribue le ticket au propriétaire du cycle sans changer son état. Les tickets en triage, terminés, annulés ou doublons ne peuvent pas être ajoutés par cette action. Vérifiez le responsable et les blocages après l’ajout ; retirer un ticket du cycle le conserve dans son projet.

![Ticket de démonstration dans le backlog du cycle personnel.](/documentation/fr/reader-cycle.png)

## Terminer ou ajuster la période {#cycle-results}

Mettez à jour les états des tickets et comparez le travail terminé au travail restant. Au changement de période, les tickets éligibles non terminés des anciens cycles passent automatiquement dans le cycle courant, en gardant leur responsable. Ce report ne les marque pas comme terminés. Quand tous les tickets du cycle courant sont clos, un bandeau **Cycle complété** propose **Remplir le cycle** pour ajouter du travail éligible ; le cycle n’est pas rempli automatiquement en cours de période. Le sélecteur de dates permet de consulter les cycles passés et à venir : ces vues sont en lecture seule, tandis que le cycle courant permet les modifications.

Si un prérequis est ajouté au cycle courant pour garder des dépendances cohérentes, examinez la raison avant de le retirer. Un ticket disparu après sa clôture peut rester visible dans le travail terminé ou par son identifiant. Les réglages de votre cycle concernent votre planification, pas le cycle personnel d’un autre membre.
