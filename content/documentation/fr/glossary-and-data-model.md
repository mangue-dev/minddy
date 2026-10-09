---
{
  "id": "glossary-and-data-model",
  "locale": "fr",
  "title": "Glossaire et modèle de données",
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
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "content/knowledge/core-tracker.md",
      "content/knowledge/productivity.md",
      "content/knowledge/pages.md",
      "content/knowledge/feedback.md",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (collection-caption clarity)",
    "date": "2026-10-09"
  },
  "related": [
    "permissions-and-public-links",
    "numo"
  ],
  "aliases": [],
  "tags": [
    "Comprendre projets, tickets, objectifs et travail personnel"
  ],
  "figures": [
    {
      "id": "glossary-and-data-model-flow",
      "kind": "diagram",
      "src": "/documentation/fr/glossary-and-data-model-flow.svg",
      "alt": "Schéma: Projet : travail et connaissances partagés. Ticket : travail ; objectif : résultat visé. Cycle personnel : travail entre projets. Page : contexte durable ; feedback : besoin.",
      "caption": "Le travail partagé du projet et la planification personnelle utilisent des objets distincts, chacun avec ses règles d’accès.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Projet : travail et connaissances partagés"
          },
          {
            "title": "Ticket : travail ; objectif : résultat visé"
          },
          {
            "title": "Cycle personnel : travail entre projets"
          },
          {
            "title": "Page : contexte durable ; feedback : besoin"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "glossary-and-data-model-flow"
  ]
}
---

## Comprendre projets, tickets, objectifs et travail personnel {#glossary-and-data-model}

Un projet est l’espace partagé des membres, tickets, catégories, vues enregistrées, pages, intégrations et tableau de feedback. Un ticket représente une tâche avec statut, responsable et éventuellement plan, échéance, objectif, catégories, relations, commentaires et ressources. Un objectif regroupe les tickets d’un projet autour d’un résultat et suit leur progression. Un cycle personnel sélectionne le travail d’une personne sur une ou deux semaines à travers les projets ; ce n’est ni un sprint partagé ni un objectif de projet.


![Schéma: Projet : travail et connaissances partagés. Ticket : travail ; objectif : résultat visé. Cycle personnel : travail entre projets. Page : contexte durable ; feedback : besoin.](/documentation/fr/glossary-and-data-model-flow.svg)

## Distinguer connaissances et demandes {#knowledge-and-feedback}

Une page conserve du contexte durable : spécification, décision ou procédure, avec sous-pages, fichiers et discussion. Une base de pages conserve des propriétés dont chaque entrée est une page complète. Un feedback décrit un besoin utilisateur avec votes et statut public, séparément d’un ticket interne. Le lier à un ticket fait suivre son statut public au travail. Une vue enregistrée filtre et trie les tickets sans les modifier. Le carnet reste privé pour notes et cases à cocher ; promouvez un élément lorsque le projet doit le suivre.

## Vérifier avec un exemple {#example}

Pour une release, créez un objectif dans le projet, décrivez la décision dans une page et attachez-la aux tickets d’implémentation. Chaque membre peut ajouter ses tickets sélectionnés à son cycle personnel. Un feedback client peut se lier au ticket pertinent sans rendre publique sa discussion privée. Une routine démarre une conversation Numo planifiée avec le contexte projet ; elle n’est ni ticket récurrent ni déclenchement à chaque changement. Conservez identifiants et propriété dans les intégrations : des contextes liés n’ont pas forcément le même accès.
