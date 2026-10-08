---
{
  "id": "glossary-and-data-model",
  "locale": "fr",
  "title": "Comprendre projets, tickets, objectifs et travail personnel",
  "summary": "Un projet est l’espace partagé des membres, tickets, catégories, vues enregistrées, pages, intégrations et tableau de feedback.",
  "topic": "Concepts techniques",
  "type": "explanation",
  "audiences": [
    "member",
    "integrator"
  ],
  "workflows": [
    "T01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
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
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "content/knowledge/core-tracker.md",
      "content/knowledge/productivity.md",
      "content/knowledge/pages.md",
      "content/knowledge/feedback.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "permissions-and-public-links",
    "numo-execution-model"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "glossary-and-data-model-flow",
      "kind": "diagram",
      "src": "/documentation/fr/glossary-and-data-model-flow.svg",
      "alt": "Schéma: Projet : travail et connaissances partagés. Ticket : travail ; objectif : résultat visé. Cycle personnel : travail entre projets. Page : contexte durable ; feedback : besoin.",
      "caption": "Ces composants ont des responsabilités distinctes. Projet : travail et connaissances partagés. Ticket : travail ; objectif : résultat visé. Cycle personnel : travail entre projets. Page : contexte durable ; feedback : besoin.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "glossary-and-data-model-flow"
  ]
}
---

## Comprendre projets, tickets, objectifs et travail personnel {#glossary-and-data-model}

Un projet est l’espace partagé des membres, tickets, catégories, vues enregistrées, pages, intégrations et tableau de feedback. Un ticket représente une tâche avec statut, responsable et éventuellement plan, échéance, objectif, catégories, relations, commentaires et ressources. Un objectif regroupe les tickets d’un projet autour d’un résultat et suit leur progression. Un cycle personnel sélectionne le travail hebdomadaire ou bimensuel d’une personne à travers les projets ; ce n’est ni un sprint partagé ni un objectif de projet.


![Schéma: Projet : travail et connaissances partagés. Ticket : travail ; objectif : résultat visé. Cycle personnel : travail entre projets. Page : contexte durable ; feedback : besoin.](/documentation/fr/glossary-and-data-model-flow.svg)

## Distinguer connaissances et demandes {#knowledge-and-feedback}

Une page conserve du contexte durable : spécification, décision ou procédure, avec sous-pages, fichiers et discussion. Une base de pages conserve des propriétés dont chaque entrée est une page complète. Un feedback décrit un besoin utilisateur avec votes et statut public, séparément d’un ticket interne. Le lier à un ticket fait suivre son statut public au travail. Une vue enregistrée filtre et trie les tickets sans les modifier. Le carnet reste privé pour notes et cases à cocher ; promouvez un élément lorsque le projet doit le suivre.

## Vérifier avec un exemple {#example}

Pour une release, créez un objectif dans le projet, décrivez la décision dans une page et attachez-la aux tickets d’implémentation. Chaque membre peut ajouter ses tickets sélectionnés à son cycle personnel. Un feedback client peut se lier au ticket pertinent sans rendre publique sa discussion privée. Une routine démarre une conversation Numo planifiée avec le contexte projet ; elle n’est ni ticket récurrent ni déclenchement à chaque changement. Conservez identifiants et propriété dans les intégrations : des contextes liés n’ont pas forcément le même accès.
