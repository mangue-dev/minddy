---
{
  "id": "recurring-issues",
  "locale": "fr",
  "title": "Répéter un ticket après sa réalisation",
  "summary": "Configurez le travail récurrent et distinguez-le d’une demande Numo planifiée.",
  "topic": "Projets et tickets",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "W09"
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
      "components/settings/project-recurrences-section.tsx",
      "content/knowledge/core-tracker.md",
      "lib/server/recurrence.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "scheduled-routines",
    "project-settings"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "recurring-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/issue-date-recurrence.png",
      "alt": "Sélecteur d’échéance en mode récurrent avec aperçu hebdomadaire le dimanche et heure optionnelle.",
      "caption": "Le mode récurrent prévisualise la cadence hebdomadaire. Confirmez la première échéance avant de créer le ticket.",
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
    "recurring-issues-steps"
  ]
}
---

## Configurer la tâche répétée {#recurring-issues}

Créez ou ouvrez un ticket utile à chaque occurrence, comme une vérification périodique des dépendances. Fixez une échéance, puis choisissez une récurrence quotidienne, hebdomadaire, mensuelle ou annuelle dans le contrôle de date du ticket. Une récurrence sans échéance est refusée. Examinez propriétés et responsable avant d’enregistrer. Les réglages de récurrence du projet présentent les séries actives ; ils permettent de modifier leur rythme ou d’arrêter la répétition.

Un ticket récurrent se recrée lorsqu’il est terminé ; le suivant arrive dans le backlog. Après réalisation, vérifiez l’identifiant et les propriétés du ticket suivant.

L’échéance suivante reprend l’échéance précédente augmentée d’une période, pas le jour de réalisation. Le nouveau ticket reprend titre, description, priorité, effort, responsable, objectif et catégories. Il ne copie ni plan d’implémentation, ni parent, ni ressources, ni commentaires. La récurrence passe au ticket suivant ; rouvrir et terminer de nouveau l’ancien ne crée pas une autre occurrence. Si la création suivante échoue, la série s’arrête plutôt que de réessayer en boucle sur le ticket terminé. Examinez le résultat et configurez la récurrence sur la prochaine tâche appropriée après résolution de l’échec. Une récurrence calendaire ne signifie pas qu’un code sera exécuté ou que le nouveau ticket sera accompli automatiquement.


![Sélecteur d’échéance en mode récurrent avec aperçu hebdomadaire le dimanche et heure optionnelle.](/documentation/fr/issue-date-recurrence.png)

## Modifier ou arrêter {#recurrence-change}

Modifiez ou désactivez la répétition future dans les réglages de récurrence. Inspectez séparément les tickets déjà créés : arrêter les prochaines créations ne les termine ni ne les supprime.

Une routine Numo est différente : elle planifie une conversation et peut consommer le budget IA du propriétaire et utiliser ses fournisseurs configurés. Choisissez la récurrence pour une tâche suivie qui se répète, et une routine pour une instruction à exécuter selon un calendrier. Si le ticket suivant manque, vérifiez que le précédent est terminé, que la récurrence est active et que les filtres n’excluent pas le backlog.
