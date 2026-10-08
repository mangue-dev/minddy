---
{
  "id": "sub-issues",
  "locale": "fr",
  "title": "Découper un ticket en sous-tickets",
  "summary": "Suivez de petites tâches sous un parent et détachez un enfant sans le supprimer.",
  "topic": "Projets et tickets",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W06"
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
      "components/issue-parent-menu.tsx",
      "components/issue-family-banner.tsx",
      "lib/server/create-issue.ts",
      "lib/server/update-issue.ts"
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
    "issue-dependencies",
    "implementation-plans"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "sub-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-sub-issues.png",
      "alt": "Champ de création d’un sous-ticket dans un parent de démonstration.",
      "caption": "Ce champ crée un enfant sous le parent ; chaque enfant conserve son état et sa discussion.",
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
    "sub-issues-steps"
  ]
}
---

## Construire la hiérarchie {#sub-issues}

Ouvrez le ticket parent et ses commandes de sous-tickets pour créer les parties du travail. Donnez à chaque enfant un résultat distinct. Après création, vérifiez projet, propriétés et identifiant du parent. La hiérarchie facilite le suivi ; elle ne remplace pas la description du résultat de chaque tâche.

La hiérarchie accepte un seul niveau : le parent doit être un ticket de premier niveau du même projet et un sous-ticket ne peut pas avoir ses propres enfants. Sans objectif explicitement choisi à la création, l’enfant hérite de celui du parent ; vérifiez les propriétés obtenues plutôt que de supposer que les modifications ultérieures du parent se propagent.

Un enfant reste un ticket avec son état et sa discussion. L’indicateur de progrès du parent est pondéré par l’effort des enfants et le crédit de progression de leurs états. Le compteur terminé/total de la liste des sous-tickets est un décompte brut distinct. Lisez les états des enfants avec ces deux mesures. Utilisez une dépendance pour « doit finir avant » et un parent pour « fait partie de cette tâche plus large ».

![Champ de création d’un sous-ticket dans un parent de démonstration.](/documentation/fr/work-sub-issues.png)

## Ouvrir ou retirer le parent {#change-parent}

L’identifiant du parent à côté du titre ouvre un menu. Son action d’ouverture permet d’inspecter la tâche globale. Pour détacher l’enfant, choisissez l’action de dissociation du parent, puis lisez la confirmation. Une dissociation réussie retire la relation tout en conservant le ticket.

Ne supprimez pas un enfant pour réorganiser la hiérarchie. Vérifiez les relations existantes avant de changer de parent et résolvez une relation refusée plutôt que de forcer une boucle. Après un échec de sauvegarde, rouvrez l’enfant pour vérifier si le changement a été appliqué avant de réessayer. Conservez le travail enfant terminé lors d’une révision du plan global.
