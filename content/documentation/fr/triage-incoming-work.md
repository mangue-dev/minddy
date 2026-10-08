---
{
  "id": "triage-incoming-work",
  "locale": "fr",
  "title": "Examiner le travail entrant dans le triage",
  "summary": "Clarifiez les nouvelles demandes avant de les intégrer au travail planifié.",
  "topic": "Projets et tickets",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "W03"
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
      "app/(app)/projects/[id]/triage/page.tsx",
      "components/triage/triage-page.tsx",
      "lib/smart-triage.ts",
      "lib/view-filter.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-statuses",
    "create-an-issue",
    "feedback-to-issue"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/triage-incoming.png",
      "alt": "Ticket de démonstration DOC-11 reçu dans le triage, avec son signalement, ses propriétés et les commandes Doublon, Refuser et Accepter.",
      "caption": "Lisez le signalement reçu avant de l’accepter, de le refuser ou de le relier à un doublon.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "triage-incoming-work-steps"
  ]
}
---

## Examiner les arrivées {#triage-incoming-work}

Ouvrez Triage dans le projet. Lisez le ticket et son contexte d’origine avant de l’accepter dans le travail planifié. Vérifiez si un ticket existant représente déjà cette demande. Précisez le résultat, le projet, le responsable, la priorité et l’effort si nécessaire.

Choisissez Accepter et confirmez pour déplacer un ticket retenu vers le backlog. Choisissez Refuser et confirmez pour le passer à l’état annulé. Pour un doublon, sélectionnez le ticket à conserver dans le sélecteur de doublon : le ticket entrant prend l’état doublon et pointe vers celui-ci. L’entrée suivante est sélectionnée quand un ticket quitte le triage. Vérifiez l’état ou le lien de doublon dans le ticket lui-même. Passer d’une carte à l’autre sans effectuer ces actions ne clôture pas le ticket.

## Ordre et limites {#triage-order}

Smart Triage utilise des règles de classement déterministes.

Dans chaque colonne d’état, les règles placent d’abord les tickets ouverts qui bloquent du travail ouvert, puis les tickets sans blocage. Les tickets bloqués par du travail ouvert passent en dernier, même s’ils en bloquent d’autres. Une extrémité clôturée ne crée plus cette priorité. Dans chaque groupe, une priorité élevée, un effort plus petit et une échéance dépassée ou proche font remonter le travail. À l’intérieur d’un même niveau de blocage, les tickets d’un objectif restent ensemble, avec un ordre fondé sur le ticket le mieux classé du groupe. Les égalités sont départagées par l’échéance, puis l’ancienneté de création, la position manuelle et enfin l’identifiant. Une relation associée ne modifie pas ce classement. Ce n’est pas un mode de triage IA expérimental. L’ordre aide à décider quoi examiner d’abord ; il ne valide pas la description, ne résout pas automatiquement les doublons et n’accorde aucune permission.

Si une entrée manque, vérifiez projet, état et filtres, puis recherchez son identifiant. Du travail importé ou synchronisé peut arriver dans le triage ; inspectez sa source et la correspondance de l’intégration avant de modifier des champs répliqués. Une demande liée depuis les retours reste un objet feedback distinct, avec sa discussion publique.


![Ticket de démonstration DOC-11 reçu dans le triage, avec son signalement, ses propriétés et les commandes Doublon, Refuser et Accepter.](/documentation/fr/triage-incoming.png)
