---
{
  "id": "delegate-code-work",
  "locale": "fr",
  "title": "Déléguer un ticket au worker de code",
  "summary": "Préparer l’accès au dépôt, suivre l’exécution et vérifier la pull request liée.",
  "topic": "Numo et intégrations",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N03"
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
      "content/knowledge/plans-and-agents.md",
      "content/knowledge/agents-and-mcp.md",
      "components/assistant/delegated-work-card.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "review-pull-requests",
    "recover-numo-work",
    "repository-skills"
  ],
  "aliases": [
    "plans-and-agents"
  ],
  "tags": [],
  "figures": [
    {
      "id": "delegate-code-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/delegate-code-work-workflow.png",
      "alt": "Carte du worker terminé avec modèle, raisonnement léger, deux fichiers modifiés, branche, PR n° 1 et commit corrigé.",
      "caption": "Carte de la correction réelle de la PR existante, avec son commit actualisé et son lien. Relisez le diff et les contrôles avant de fusionner : le statut terminé ne suffit pas à valider les critères.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1480,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "delegate-code-work-workflow"
  ]
}
---

## Préparer une implémentation délimitée {#delegate-code-work}
Le projet doit avoir un dépôt GitHub ou GitLab lié, une autorisation fournisseur valide et un sandbox serveur configuré. Vérifiez le modèle et le raisonnement du worker dans les paramètres IA du compte. Le modèle de conversation ne remplace pas ces réglages.

1. Ouvrez le ticket et décrivez le résultat attendu, les contraintes et les critères à vérifier.
2. Ouvrez Numo avec le contexte du ticket. Demandez une inspection du dépôt avant un plan technique. Des fichiers ou API non vérifiés ne constituent pas une preuve.
3. Demandez explicitement l’implémentation. Numo délègue les changements de branche au worker, qui clone le dépôt lié dans le sandbox serveur.
4. Suivez sa carte pour la progression, les fichiers, les contrôles et les questions. Répondez dans la conversation.
5. Ouvrez la pull request liée. Relisez le diff et les contrôles face aux critères avant de fusionner. Une prévisualisation existe seulement si le fournisseur de déploiement en a produit une.

![Carte du worker terminé avec modèle, raisonnement léger, deux fichiers modifiés, branche, PR n° 1 et commit corrigé.](/documentation/fr/delegate-code-work-workflow.png)


## Reprendre sans doublon {#continuation}
Un point de reprise peut permettre de continuer s’il a été conservé, sans garantir l’achèvement. Vérifiez la branche et la PR avant de relancer. Conservez les tâches cochées et les modifications concurrentes du plan. Les fichiers uniquement présents sur votre ordinateur sont indisponibles : poussez d’abord le code ou les skills nécessaires.
