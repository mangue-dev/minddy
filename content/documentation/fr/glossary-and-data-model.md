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
  "revision": 5,
  "sourceRevision": 5,
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
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 5,
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

Un projet est l’espace partagé des membres, tickets, catégories, vues enregistrées, pages, intégrations et tableau de feedback. Chaque personne y a un rôle : un propriétaire, des membres qui travaillent sur le contenu et des lecteurs qui le suivent. Un ticket représente une tâche avec statut, responsable et éventuellement plan, échéance, objectif, catégories, relations, commentaires et ressources. Un objectif regroupe les tickets d’un projet autour d’un résultat et suit leur progression. Un cycle personnel sélectionne le travail d’une personne sur une ou deux semaines à travers les projets ; ce n’est ni un sprint partagé ni un objectif de projet.


![Schéma: Projet : travail et connaissances partagés. Ticket : travail ; objectif : résultat visé. Cycle personnel : travail entre projets. Page : contexte durable ; feedback : besoin.](/documentation/fr/glossary-and-data-model-flow.svg)

## Distinguer connaissances et demandes {#knowledge-and-feedback}

Une page conserve du contexte durable : spécification, décision ou procédure, avec sous-pages, fichiers et discussion. Une base de pages conserve des propriétés dont chaque entrée est une page complète. Un feedback décrit un besoin utilisateur avec votes et statut public, séparément d’un ticket interne. Le lier à un ticket fait suivre son statut public au travail. Une vue enregistrée filtre et trie les tickets sans les modifier. Le carnet reste privé pour notes et cases à cocher ; promouvez un élément lorsque le projet doit le suivre.

## Vérifier avec un exemple {#example}

Pour une release, créez un objectif dans le projet, décrivez la décision dans une page et attachez-la aux tickets d’implémentation. Chaque membre peut ajouter ses tickets sélectionnés à son cycle personnel. Un feedback client peut se lier au ticket pertinent sans rendre publique sa discussion privée. Une routine démarre une conversation Numo avec le contexte du projet selon un planning, ou quand un événement choisi remplit ses conditions, par exemple un ticket qui entre dans un statut ou une nouvelle entrée de base de données ; elle n’est pas un ticket récurrent et ne modifie pas le code du dépôt. Conservez identifiants et propriété dans les intégrations : des contextes liés n’ont pas forcément le même accès.
