---
{
  "id": "submit-and-follow-feedback",
  "locale": "fr",
  "title": "Soumettre, voter et suivre un retour",
  "summary": "S’identifier sur le tableau, choisir la visibilité et retrouver demandes et votes.",
  "topic": "Retours et demandes",
  "type": "guide",
  "audiences": [
    "visitor"
  ],
  "workflows": [
    "F02"
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
      "app/f/[token]/feedback-auth.tsx",
      "app/f/[token]/actions.ts",
      "app/f/[token]/me/page.tsx",
      "lib/server/feedback/otp.ts",
      "lib/feedback/types.ts",
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
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/submit-and-follow-feedback-workflow.png",
      "alt": "Formulaire visiteur avec titre, description et visibilité publique activée.",
      "caption": "Un visiteur identifié soumet un besoin et choisit sa visibilité. L’exemple a été réellement envoyé avec la revue automatique désactivée.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1365,
        1000
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "submit-and-follow-feedback-workflow"
  ]
}
---

## S’identifier et soumettre {#submit-and-follow-feedback}

Ouvrez l’URL publique du board. Vous pouvez lire les retours publics sans compte Minddy. Pour soumettre, voter ou commenter, identifiez-vous par le code email du board ou le lien SSO du produit. La réception du code dépend du service email de l’instance. Un code reste valable dix minutes et autorise cinq tentatives ; attendez au moins soixante secondes avant d’en demander un autre. Ne partagez jamais ce code.

Recherchez les demandes existantes avant d’en publier une. Donnez un titre précis et décrivez le besoin et son contexte. Le titre accepte 200 caractères et le corps 10 000. L’option publique est cochée par défaut ; décochez-la pour adresser la demande en privé à l’équipe. Vérifiez que le texte ne contient pas de secrets avant l’envoi. Une modération facultative peut maintenir la demande en attente avant son affichage public.


## Voter, commenter et suivre {#follow}

Votez pour une demande existante plutôt que de la dupliquer. Votre identité dispose d’un vote par retour. Pour commenter, vous devez vous identifier et les commentaires publics doivent être activés ; un commentaire public accepte 5 000 caractères. Vous pouvez supprimer votre propre commentaire et l’équipe peut modérer les commentaires publics.

Ouvrez Mes retours pour retrouver vos demandes et vos votes, selon les droits de votre identité actuelle. Consultez leur statut public et les réponses de l’équipe à cet endroit ou sur la demande. Les notes réservées à l’équipe ne sont pas des réponses publiques. Si le SSO a expiré, revenez par un nouveau lien du produit ; un changement de navigateur ou d’identité peut modifier cette liste personnelle.

![Formulaire visiteur avec titre, description et visibilité publique activée.](/documentation/fr/submit-and-follow-feedback-workflow.png)
