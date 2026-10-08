---
{
  "id": "issue-discussion-and-resources",
  "locale": "fr",
  "title": "Discuter du travail et joindre son contexte",
  "summary": "Utilisez commentaires, mentions, fichiers et pages liées comme ressources du ticket.",
  "topic": "Projets et tickets",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W08"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
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
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/issue-timeline.tsx",
      "components/issue-resources-section.tsx",
      "content/knowledge/core-tracker.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-and-organize-pages",
    "page-files",
    "notifications-and-inbox"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-discussion-and-resources-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-resources.png",
      "alt": "Dialogue d’ajout de lien avec une adresse de contact d’exemple.",
      "caption": "Vérifiez la destination avant d’ajouter la ressource. Ce lien d’exemple n’a pas été envoyé.",
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
    "issue-discussion-and-resources-steps"
  ]
}
---

## Ajouter une discussion ou une ressource {#issue-discussion-and-resources}

Ouvrez le fil du ticket pour ajouter un commentaire. Expliquez une décision, posez une question ou décrivez un résultat de vérification pour qu’un autre membre comprenne le changement. Les mentions ajoutent une personne ou un objet au contexte ; les notifications dépendent toujours des préférences et de la livraison sur ses appareils.

Joignez une page du projet, un fichier ou un lien depuis les ressources. Une page liée est une ressource vivante : son titre suit les renommages et son contenu évolue. Un fichier est une pièce jointe stockée, pas la garantie qu’une URL externe restera disponible.

![Dialogue d’ajout de lien avec une adresse de contact d’exemple.](/documentation/fr/work-resources.png)

## Visibilité et envoi échoué {#resource-access}

L’accès au projet et au ticket contrôle les discussions et ressources internes. Ajouter une ressource ne la publie pas anonymement. Dans un parcours feedback, distinguez discussion d’équipe et réponse publique avant d’envoyer le texte.

Après envoi, vérifiez que la ressource apparaît et s’ouvre. En cas d’échec, gardez le fichier original, lisez l’erreur et vérifiez la taille ou le quota de stockage applicable. En auto-hébergement, les métadonnées Storage, les règles d’accès et les fichiers doivent aussi fonctionner. Ne joignez pas d’identifiants ni de diagnostics privés non nettoyés.
