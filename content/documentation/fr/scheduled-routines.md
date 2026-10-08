---
{
  "id": "scheduled-routines",
  "locale": "fr",
  "title": "Routines planifiées",
  "summary": "Définir le contexte, le fuseau horaire et le plafond IA, puis examiner chaque occurrence.",
  "topic": "Numo et intégrations",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "N06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/routines/create-routine-wizard.tsx",
      "components/routines/routine-detail.tsx",
      "content/documentation/reviews/routine-localized-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Planifier et suivre une routine Numo"
  ],
  "figures": [
    {
      "id": "scheduled-routines-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/scheduled-routines-workflow.png",
      "alt": "Éditeur d’une routine de démonstration existante en pause, avec son instruction localisée pour l’affichage.",
      "caption": "Éditeur d’une routine de démonstration existante en pause, avec son instruction localisée pour l’affichage. Le calendrier et le plafond restent inchangés ; rien n’a été enregistré ni exécuté.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1447,
        1085
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "scheduled-routines-workflow"
  ]
}
---

## Créer la demande planifiée {#scheduled-routines}

Seul le propriétaire du projet peut créer sa routine. Ouvrez les routines et lancez une création. Choisissez un projet dont vous êtes propriétaire, rédigez l’instruction et mentionnez les tickets, pages ou objectifs utiles. Sélectionnez le calendrier et le fuseau ; lisez l’aperçu de la première exécution avant de créer. Fixez le plafond par exécution en pourcentage du budget mensuel.

Chaque occurrence crée une conversation avec l’instruction et le contexte sauvegardés. Elle utilise le budget IA et les connexions MCP du propriétaire. Numo délègue au worker uniquement si nécessaire, avec ses réglages de compte.

## Gérer et vérifier les exécutions {#runs}

Ouvrez la routine pour modifier instruction ou calendrier, la suspendre ou consulter les occurrences. Une exécution manuelle consomme également du budget. Lisez sa conversation pour le résultat, les questions, les contrôles et le travail délégué. Une attente de précision nécessite une réponse ; le calendrier ne la fournit pas.

Si le plafond arrête une exécution, vérifiez les résultats avant de le modifier ou de relancer. Après un changement de propriétaire, lancez une occurrence sous le propriétaire courant : les anciennes ne peuvent pas utiliser les connexions du précédent.

![Éditeur d’une routine de démonstration existante en pause, avec son instruction localisée pour l’affichage.](/documentation/fr/scheduled-routines-workflow.png)
