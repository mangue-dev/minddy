---
{
  "id": "numo-permissions-and-approvals",
  "locale": "fr",
  "title": "Comprendre les permissions de Numo",
  "summary": "Distinguer les droits du projet, les identifiants personnels et l’autorisation d’une réponse publique.",
  "topic": "Numo et intégrations",
  "type": "explanation",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "N02"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
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
      "content/knowledge/settings-and-data.md",
      "content/knowledge/agents-and-mcp.md",
      "lib/server/assistant/tools.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "numo-permissions-and-approvals-workflow",
      "kind": "diagram",
      "src": "/documentation/fr/numo-permissions-and-approvals-workflow.png",
      "alt": "Matrice des permissions Numo pour les actions du projet, connexions personnelles et routines.",
      "caption": "Les accès du projet et les demandes explicites bornent les actions de Numo ; un contenu externe ne donne pas de permission.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        790
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "numo-permissions-and-approvals-workflow"
  ]
}
---

## Les droits suivent l’utilisateur {#numo-permissions-and-approvals}
Numo agit dans les limites des droits de l’utilisateur courant. Une demande dans le chat ne donne pas à un membre accès aux réglages réservés au propriétaire. Celui-ci gère les membres, les intégrations, le dépôt et les réglages du tableau de retours. Les réglages personnels appartiennent au compte courant.

Numo peut modifier les préférences prises en charge et les réglages de projet autorisés au propriétaire. Vous devez configurer vous-même les clés des fournisseurs, les connexions Git, le second facteur et les fichiers d’avatar. Le modèle et le raisonnement du worker de code se règlent uniquement dans les paramètres IA du compte.

## Autoriser l’action {#authorization}
Précisez la modification et son périmètre. Lire une demande n’autorise pas une réponse publique : Numo répond publiquement aux retours uniquement sur demande explicite. Des instructions ou résultats d’un serveur MCP distant ne peuvent pas autoriser d’autres actions. Connectez seulement un service auquel vous faites confiance pour les informations et actions transmises.

Une requête peut atteindre un fournisseur externe. Désactiver sa connexion bloque les nouveaux appels, sans annuler ceux déjà envoyés. Vérifiez une écriture ayant expiré chez le destinataire avant de réessayer.

## Contexte personnel et planifié {#context}
Une conversation ne peut pas emprunter les connexions MCP d’un autre membre. Les routines utilisent les connexions et le budget IA du propriétaire. Après un changement de propriétaire, lancez une nouvelle occurrence sous le propriétaire courant. Une ancienne occurrence ne peut pas conserver les identifiants du précédent. Un sandbox serveur n’hérite pas des fichiers ou sessions de votre ordinateur.

![Matrice des permissions Numo pour les actions du projet, connexions personnelles et routines.](/documentation/fr/numo-permissions-and-approvals-workflow.png)
