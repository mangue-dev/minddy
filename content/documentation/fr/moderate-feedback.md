---
{
  "id": "moderate-feedback",
  "locale": "fr",
  "title": "Examiner les retours en privé et répondre publiquement",
  "summary": "Traiter les demandes sans exposer les notes internes ni réécrire les visiteurs.",
  "topic": "Retours et demandes",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "F03"
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
      "lib/server/feedback/posts.ts",
      "lib/server/feedback/comment-guard.ts",
      "app/api/projects/[id]/feedback/[postId]/comments/route.ts",
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
      "id": "moderate-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/moderate-feedback-workflow.png",
      "alt": "Détail d’un retour avec réponse publique de l’équipe et note interne.",
      "caption": "Le badge Public distingue la réponse visible aux visiteurs ; la note interne reste accessible à l’équipe. Aucun résultat de modération IA n’est présenté.",
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
    "moderate-feedback-workflow"
  ]
}
---

## Examiner une demande {#moderate-feedback}

Les membres du projet ouvrent sa rubrique Retours et choisissent une demande dans la file de revue ou la liste. Lisez la soumission d’origine, le choix public ou privé, l’état de revue et les éventuelles suggestions de modération ou de doublon. Vous pouvez clarifier le titre et le corps canoniques tout en conservant les textes soumis d’origine. Attribuez des catégories et un statut public adapté ; un spam n’apparaît jamais sur le board public. Une demande privée reste distincte d’une demande publique simplement en attente.

Une traduction facultative s’affiche à côté du texte source pour l’équipe ; le board public conserve le retour tel qu’il a été écrit. Vérifiez les classifications IA avant de vous y fier. Si un retour est lié à un ticket, son statut est contrôlé par ce ticket et ne peut pas être modifié indépendamment.


## Notes et réponses publiques {#responses}

Choisissez la discussion interne pour les notes d’équipe. Les réponses publiques sont visibles aux visiteurs : vérifiez la visibilité avant l’envoi. Une réponse hérite de la visibilité de son fil ; choisir le mode interne dans le composeur ne rend pas privée une réponse à un fil public. Les réponses publiques de Numo exigent une demande explicite ; mentionner Numo dans un commentaire public ne déclenche pas de réponse automatique.

Les membres de l’équipe peuvent supprimer des commentaires publics pour les modérer. Seul l’auteur peut modifier son texte ; l’équipe ne réécrit jamais les propos des visiteurs. Les commentaires internes conservent leurs règles réservant les actions à l’auteur. Après une réponse publique ou une modération, consultez le board déconnecté pour vérifier la visibilité obtenue.

![Détail d’un retour avec réponse publique de l’équipe et note interne.](/documentation/fr/moderate-feedback-workflow.png)
