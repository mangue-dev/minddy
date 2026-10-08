---
{
  "id": "implementation-plans",
  "locale": "fr",
  "title": "Maintenir un plan d’implémentation",
  "summary": "Suivez des étapes ordonnées séparément de la description sans perdre le travail terminé.",
  "topic": "Projets et tickets",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W07"
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
      "content/knowledge/plans-and-agents.md",
      "components/issue-plan.tsx",
      "captures/shots/issue-plan/intent.md",
      "lib/plan.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-discussion-and-resources",
    "delegate-code-work",
    "review-pull-requests"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "implementation-plans-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-implementation-plan.png",
      "alt": "Plan de démonstration avec deux tâches de travail terminées sur six.",
      "caption": "Le plan enregistré distingue les étapes terminées, actives et en attente. Sa progression ne prouve pas l’exécution de la tâche de code fictive.",
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
    "implementation-plans-steps"
  ]
}
---

## Écrire le plan {#implementation-plans}

Ouvrez l’onglet Plan du ticket. La description doit déjà préciser problème et résultat attendu. Ajoutez les étapes manuellement, ou demandez à Numo de lire le dépôt lié avant de proposer un plan technique. Un chemin ou une fonction générés par IA ne sont pas une preuve si le dépôt n’a pas été inspecté.

Indentez une ligne de tâche de deux espaces par niveau ; une tabulation compte pour quatre espaces. Cette imbrication organise les étapes du plan, sans créer de relation parent-enfant entre tickets. Chaque tâche de travail non annulée contribue à la progression, y compris les tâches imbriquées.

Le plan utilise des lignes de tâches Markdown : `- [ ]` pour une tâche en attente, `- [~]` pour une tâche en cours, `- [x]` pour une tâche terminée et `- [-]` pour une tâche annulée. Placez le texte après le marqueur, par exemple `- [ ] Vérifier le lien de contact sur mobile`. Les tâches annulées ne comptent pas dans la progression. Les tâches sous un titre Questions reconnu sont traitées comme des questions et sont aussi exclues du calcul ; placez donc le travail dans une autre section de même niveau de titre. Enregistrez explicitement les modifications ; annuler abandonne le brouillon. Une case du plan affiché modifie l’état de cette tâche. Utilisez les états en attente, en cours, terminé et annulé pour refléter ce qui s’est passé, sans suggérer une vérification qui n’a pas été exécutée.

![Plan de démonstration avec deux tâches de travail terminées sur six.](/documentation/fr/work-implementation-plan.png)

## Conserver le progrès et les changements concurrents {#plan-progress}

Complétez ou corrigez le plan existant plutôt que de le remplacer par une nouvelle copie décochée. Gardez les étapes terminées et les raisons des changements de périmètre. Avant une réécriture importante, comparez avec le dernier plan si un membre ou un agent travaille aussi sur le ticket.

Un plan écrit peut être confié à Numo lorsque le travail sur dépôt et son sandbox configuré sont disponibles. Après du travail accompli, l’interface propose aussi une vérification d’implémentation. Ces actions lancent du travail ; cocher une étape ne prouve pas que le code passe les tests. Lisez résultat, modifications et contrôles avant de terminer le ticket.
