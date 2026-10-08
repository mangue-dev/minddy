---
{
  "id": "publish-a-feedback-board",
  "locale": "fr",
  "title": "Publier un tableau de retours",
  "summary": "Activer le canal visiteurs et choisir identité, affichage et revue comme propriétaire.",
  "topic": "Retours et demandes",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "F01"
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
      "content/knowledge/feedback.md",
      "components/project-feedback-settings.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/posts.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "submit-and-follow-feedback",
    "moderate-feedback",
    "feedback-to-issue",
    "feedback-pages-and-views",
    "feedback-ingestion-and-sso"
  ],
  "aliases": [
    "feedback"
  ],
  "tags": [],
  "figures": [
    {
      "id": "publish-a-feedback-board-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/publish-a-feedback-board-workflow.png",
      "alt": "Board public de retours activé, avec identité SSO locale configurée et URL masquée.",
      "caption": "Le propriétaire active le board et choisit l’identité des visiteurs. Cet exemple utilise une signature SSO locale ; l’URL et le secret de signature sont masqués.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1150
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "publish-a-feedback-board-workflow"
  ]
}
---

## Configurer et ouvrir le tableau {#publish-a-feedback-board}

En tant que propriétaire, ouvrez Retours dans les réglages du projet. Terminez la configuration si aucun board n’existe, puis activez le canal du board public. Copiez son URL publique et ouvrez-la dans un navigateur déconnecté pour vérifier la vue des visiteurs. Les membres peuvent consulter les réglages, mais ne peuvent ni modifier la publication, ni renouveler les tokens, ni gérer le secret SSO.

Choisissez l’identification des visiteurs par code email ou par SSO configuré. Réglez les commentaires publics, l’affichage des catégories et les onglets des pages ou vues publiques sélectionnées. Examinez les données visibles avant de diffuser l’URL. Les visiteurs peuvent lire sans s’identifier ; publier un retour, voter et commenter exigent une identité sur le board. Les représentations publiques n’exposent ni l’email ni le vrai nom des visiteurs, tandis que l’équipe peut traiter leurs retours identifiés en privé.


## Publication et ingestion sont distinctes {#channels}

Désactiver le board rend ses pages inaccessibles aux visiteurs. L’ingestion de serveur à serveur utilise une clé d’intégration feedback distincte et peut continuer sans board public. Le choix de visibilité d’un retour, son état de revue et son statut spam contrôlent aussi son affichage : activer le board ne publie pas à lui seul tous les retours.

La revue Numo facultative s’applique aux retours soumis et dépend des réglages du projet et de l’instance, des fournisseurs et du budget du propriétaire. Si elle est activée, les soumissions attendent leur revue avant publication ; si elle est désactivée, elles n’attendent pas une revue inexistante. Vérifiez la file de revue après une soumission de démonstration. Numo n’envoie une réponse publique que sur demande explicite.

![Board public de retours activé, avec identité SSO locale configurée et URL masquée.](/documentation/fr/publish-a-feedback-board-workflow.png)
