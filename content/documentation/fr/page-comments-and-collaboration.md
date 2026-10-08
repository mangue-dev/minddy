---
{
  "id": "page-comments-and-collaboration",
  "locale": "fr",
  "title": "Discuter d’une page et gérer les conflits",
  "summary": "Utilisez les fils ancrés et distinguez la présence des modifications enregistrées.",
  "topic": "Pages et bases de données",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P03"
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
      "components/pages/page-comment-popover.tsx",
      "components/pages/page-presence.tsx",
      "components/pages/page-conflict-banner.tsx",
      "lib/pages-merge.ts",
      "components/pages/page-view.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-history",
    "page-editor",
    "notifications-and-inbox"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/page-comments.png",
      "alt": "Fenêtre d’activité de la page avec modification de démonstration et champ de commentaire vide.",
      "caption": "Lisez l’activité et rédigez un commentaire dans le champ. Aucun commentaire n’a été envoyé dans cet exemple.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        600
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-comments-and-collaboration-steps"
  ]
}
---

## Ajouter et résoudre un fil {#page-comments-and-collaboration}

Ouvrez une page du projet et ses commentaires. Sélectionnez le contenu concerné pour créer un commentaire ancré, expliquez question ou proposition et mentionnez le membre à solliciter. Répondez dans le fil pour garder la décision près du contexte. Résolvez-le lorsque la question est effectivement traitée.

Les avatars de présence indiquent les personnes qui consultent la page. Ils ne prouvent pas que le texte non enregistré d’une autre personne a atteint le serveur ou que les modifications simultanées fusionnent automatiquement. Vérifiez l’enregistrement avant de quitter.


![Fenêtre d’activité de la page avec modification de démonstration et champ de commentaire vide.](/documentation/fr/page-comments.png)

## Récupérer un conflit {#page-conflict}

Minddy fusionne les modifications de blocs de premier niveau différents lorsqu’il peut conserver les deux changements. Il ne fusionne pas caractère par caractère les textes écrits simultanément dans un même bloc. Si les deux personnes ont modifié ce bloc, le document garde la version distante et une bannière propose votre ancien bloc pour examen.

Comparez le bloc désigné avec le document actuel. Choisissez Restaurer la mienne seulement si vous voulez le remplacer par votre version. Si votre action en conflit était une suppression, Le supprimer à nouveau applique explicitement cette suppression. Fermer conserve le document adopté et ferme l’avertissement ; cette action ne restaure pas votre version. Conservez le texte à garder avant de fermer et consultez l’historique si une récupération plus large est nécessaire. Ces choix ciblent le bloc identifié plutôt que de remplacer aveuglément toute la page.

Une modification du document peut détacher une ancre ; lisez la discussion avant de déplacer ou supprimer le bloc. Commentaires et activité restent internes au projet sauf contenu explicitement publié par un circuit pris en charge. Testez la page publiée pour connaître la vue réelle du visiteur plutôt que de supposer que les commandes collaboratives deviennent publiques.
