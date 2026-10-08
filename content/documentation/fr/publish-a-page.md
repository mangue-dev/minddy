---
{
  "id": "publish-a-page",
  "locale": "fr",
  "title": "Publier une page et révoquer son lien",
  "summary": "Testez la vue visiteur, choisissez l’accès aux enfants et retirez la publication.",
  "topic": "Pages et bases de données",
  "type": "tutorial",
  "audiences": [
    "member",
    "visitor"
  ],
  "workflows": [
    "P06"
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
      "components/pages/page-publish-dialog.tsx",
      "lib/server/page-publication.ts",
      "app/p/[token]/page.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "share-a-view",
    "page-files",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "publish-a-page-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/page-publish.png",
      "alt": "Fenêtre de publication avec Privée sélectionné et options par mot de passe ou lien.",
      "caption": "Privée conserve la page dans le projet. Vérifiez le public souhaité avant de modifier la publication.",
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
    "publish-a-page-steps"
  ]
}
---

## Publier le bon contenu {#publish-a-page}

Ouvrez la page comme membre et ses commandes de publication. Relisez contenu et pièces jointes. Choisissez privé, protégé par mot de passe ou public. Le mot de passe exige au moins huit caractères et s’applique après envoi ; sélectionner le mode seul ne crée pas de lien protégé.

Copiez le lien /p/ après réussite. Si la page a des descendants, examinez l’option d’inclusion des enfants et leur nombre. L’inclusion publie la branche choisie ; l’exclusion laisse leur contenu hors de cette publication. Une base publiée sans ses enfants ne révèle pas automatiquement tous les corps de ses entrées.

Ouvrez le lien dans une session sans votre compte. Testez mot de passe éventuel, contenu, sous-pages souhaitées et téléchargements. Vous vérifiez ainsi la lecture du visiteur plutôt que vos permissions de membre plus larges.


![Fenêtre de publication avec Privée sélectionné et options par mot de passe ou lien.](/documentation/fr/page-publish.png)

## Révoquer et contrôler {#revoke-page}

Revenez à la publication et choisissez privé. Après succès, ouvrez l’ancien lien anonymement pour vérifier le refus d’accès. Les copies ou captures déjà reçues ne peuvent pas être rappelées. Les adresses de téléchargement déjà transmises par une page publiée sont signées pour une durée allant jusqu’à 24 heures. La révocation bloque les nouvelles visites de la page, mais ces adresses peuvent rester valides jusqu’à leur expiration.

Les liens des utilisateurs restent noindex et distincts du manuel officiel indexé. Noindex limite la découverte, ce n’est pas un mot de passe. Si un enfant ou fichier est visible à tort, révoquez d’abord, inspectez la branche publiée et retestez avant d’envoyer un lien corrigé. Une référence interne ne donne pas accès aux fichiers d’une page non publiée.
