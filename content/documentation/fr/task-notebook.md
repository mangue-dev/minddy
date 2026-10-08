---
{
  "id": "task-notebook",
  "locale": "fr",
  "title": "Carnet de tâches",
  "summary": "Écrivez des notes rapides et transformez une tâche choisie en travail de projet lorsqu’elle doit être suivie.",
  "topic": "Planifier et retrouver le travail",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W17"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
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
      "components/scratchpad/scratchpad-modal.tsx",
      "components/scratchpad/start-tasks.ts",
      "components/scratchpad/scratchpad-task.tsx",
      "components/scratchpad/task-item-view.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/scratchpad/scratchpad-trigger.tsx"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "issues",
    "numo",
    "pages"
  ],
  "aliases": [],
  "tags": [
    "Noter des tâches dans le carnet privé"
  ],
  "figures": [
    {
      "id": "task-notebook-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-task-notebook.png",
      "alt": "Tâches personnelles de démonstration localisées dans le carnet.",
      "caption": "Le carnet suit des étapes personnelles hors de la hiérarchie des tickets du projet. Les états des tâches d’exemple restent inchangés.",
      "revision": 3,
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
    "task-notebook-steps"
  ]
}
---

## Capturer l’idée {#task-notebook}

Ouvrez le carnet depuis les commandes personnelles, ou utilisez Commande+Maj+K sur macOS et Ctrl+Maj+K sur Windows/Linux lorsque le focus est hors d’un champ de texte. Ce bloc-notes appartient au compte et accueille notes et cases à cocher. Ajoutez le contexte, organisez des sections si utile et suivez de petites étapes personnelles avant de les convertir en tickets.

Le carnet est privé, contrairement au wiki d’un projet. Choisissez une page pour les informations à partager avec des collègues. Numo peut lire ou modifier le carnet à votre demande ; l’adhésion d’un autre membre au projet n’en fait pas un document partagé.

![Tâches personnelles de démonstration localisées dans le carnet.](/documentation/fr/work-task-notebook.png)

## Promouvoir une tâche {#promote-note}

Ouvrez le menu de la tâche et choisissez sa promotion lorsqu’elle doit devenir du travail de projet. Le carnet se ferme et Numo s’ouvre avec une demande préparée contenant la tâche et ses sous-tâches. Le projet courant est utilisé si vous en consultez un ; depuis un écran global, précisez le projet de destination dans la conversation. Relisez la demande avant de l’envoyer. Ce parcours nécessite un budget IA disponible ou une clé personnelle compatible ; l’ouvrir ne crée pas encore de ticket. Après que Numo a annoncé la création, ouvrez le ticket pour vérifier son identifiant, son périmètre et ses propriétés. La promotion doit garder le contexte nécessaire ; ajoutez les conditions de réalisation manquantes.

Après un échec ou un résultat réseau incertain, cherchez le ticket avant une nouvelle promotion. Gardez les autres sections intactes lorsque vous demandez une modification à Numo et vérifiez qu’il a modifié la bonne case plutôt que remplacé tout le carnet.
