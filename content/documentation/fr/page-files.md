---
{
  "id": "page-files",
  "locale": "fr",
  "title": "Joindre et récupérer des fichiers de page",
  "summary": "Envoyez un fichier, vérifiez son accès et comprenez ce que la publication rend lisible.",
  "topic": "Pages et bases de données",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P04"
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
      "components/pages/page-uploads.tsx",
      "lib/server/page-files.ts",
      "content/knowledge/pages.md",
      "lib/server/page-publication.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "publish-a-page",
    "storage-and-attachments"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/page-file-states.png",
      "alt": "Page de démonstration avec un envoi inachevé et un fichier enregistré de 67 octets proposant Télécharger.",
      "caption": "Vérifiez l’état réel du fichier : la seconde pièce jointe est disponible, contrairement au premier envoi inachevé.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-files-steps"
  ]
}
---

## Envoyer et vérifier le fichier {#page-files}

Ouvrez la page comme membre et utilisez ses commandes de pièce jointe ou d’envoi. Choisissez un fichier non vide de 10 Mo maximum. Le quota du compte ou de l’instance peut ajouter une limite. Gardez l’original jusqu’au succès.

Les images peuvent être insérées en blocs d’image et les autres documents en blocs de fichier. Le serveur détermine le type stocké à partir des octets, sans se fier au nom du fichier ou au libellé du navigateur. L’envoi réussi ne garantit pas un aperçu intégré pour tous les formats ; téléchargez le fichier si l’aperçu est indisponible.

Vérifiez l’apparition du fichier, puis ouvrez-le ou téléchargez-le. Les octets sont dans Storage ; page et métadonnées déterminent l’accès. Une page enregistrée ne prouve pas à elle seule que les octets sont disponibles.

## Fichiers partagés et échecs {#file-access}

Un fichier référencé sur une page publiée peut être accessible à ses visiteurs. Un fichier d’une page hors de la branche publiée ne devient pas accessible par une simple référence ailleurs. Examinez page et enfants inclus avant partage.

Si l’envoi échoue, vérifiez taille, quota et erreur. En auto-hébergement, l’opérateur doit aussi vérifier configuration et règles Storage. Après restauration, un fichier absent nécessite les octets Storage et métadonnées correspondants ; restaurer uniquement la base ne recrée pas le fichier. Les adresses de fichiers publiés sont signées pour une durée allant jusqu’à 24 heures lors de l’affichage de la page. Révoquer un partage arrête les nouvelles visites autorisées de la page, sans invalider immédiatement les adresses déjà transmises : elles peuvent rester utilisables jusqu’à expiration. Les copies téléchargées ne peuvent pas être rappelées.


![Page de démonstration avec un envoi inachevé et un fichier enregistré de 67 octets proposant Télécharger.](/documentation/fr/page-file-states.png)
