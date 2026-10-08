---
{
  "id": "feedback-to-issue",
  "locale": "fr",
  "title": "Fusionner des retours et les relier à la livraison",
  "summary": "Choisir une demande canonique, lier le travail réel et vérifier le statut public.",
  "topic": "Retours et demandes",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "F04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "components/feedback/feedback-team-page.tsx",
      "app/api/projects/[id]/feedback/[postId]/promote/route.ts",
      "app/api/projects/[id]/feedback/[postId]/link/route.ts",
      "lib/server/feedback/merge.ts",
      "lib/server/feedback/status-sync.ts",
      "lib/server/feedback/notify.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "feedback-to-issue-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/feedback-to-issue-workflow.png",
      "alt": "Retour lié à un ticket créé, avec le statut Prévu.",
      "caption": "La promotion de cet exemple a créé un ticket lié en statut À faire. Le retour public est automatiquement passé à Prévu.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "feedback-to-issue-workflow"
  ]
}
---

## Résoudre les doublons {#feedback-to-issue}

En tant que membre du projet, ouvrez la demande et choisissez de la fusionner dans une demande canonique existante du même projet. Lisez d’abord les deux besoins : des formulations similaires ne prouvent pas qu’ils visent le même résultat. La demande courante devient le doublon, les votes sont réunis par identité et le doublon redirige vers la demande canonique. Examinez l’événement de fusion dans l’activité ; l’annulation utilise cet événement. Refusez une suggestion de fusion IA incorrecte plutôt que de l’accepter pour vider la file.


## Créer ou lier du travail {#work}

Créez un ticket à partir de la demande si le travail n’est pas encore suivi. Vérifiez les champs de création avant de confirmer ; sans champs fournis, la promotion crée par défaut un ticket dans le backlog. Si un ticket existe déjà, utilisez plutôt l’action de liaison. Un retour déjà lié ne peut pas être promu de nouveau. Retirer la liaison conserve le dernier statut public et arrête la relation avec le ticket.

Le statut lié suit celui du ticket : triage/backlog/duplicate → open ; todo → planned ; in_progress/in_review → in_progress ; done → shipped ; canceled → declined. Replacer le travail dans le backlog rouvre aussi le statut du retour. Vérifiez le ticket lié et la demande en navigation déconnectée après un changement d’état.

Les notifications de l’équipe à l’arrivée d’un retour dépendent de sa source et de sa transition de revue. Ne promettez pas à un votant un email automatique pour chaque fusion ou mise à jour de ticket ; il peut consulter le statut public et les réponses dans Mes retours. La liaison rend l’avancement visible sans exposer le ticket privé lui-même.

![Retour lié à un ticket créé, avec le statut Prévu.](/documentation/fr/feedback-to-issue-workflow.png)
