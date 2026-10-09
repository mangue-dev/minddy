---
{
  "id": "code-work",
  "locale": "fr",
  "title": "Travail de code et pull requests",
  "summary": "Déléguez l’implémentation d’un ticket à un agent de code, poursuivez le travail et examinez la pull request liée.",
  "topic": "Numo et intégrations",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "N03",
    "N04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "components/assistant/delegated-work-card.tsx",
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-reviews-details.tsx"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "numo",
    "repository-skills"
  ],
  "aliases": [
    "delegate-code-work",
    "plans-and-agents",
    "review-pull-requests"
  ],
  "tags": [
    "Déléguer un ticket au worker de code",
    "Relire une pull request liée"
  ],
  "figures": [
    {
      "id": "delegate-code-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/delegate-code-work-workflow.png",
      "alt": "Carte du worker terminé avec modèle, raisonnement léger, deux fichiers modifiés, branche, PR n° 1 et commit corrigé.",
      "caption": "Carte de la correction réelle de la PR existante, avec son commit actualisé et son lien. Relisez le diff et les contrôles avant de fusionner : le statut terminé ne suffit pas à valider les critères.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        912,
        179
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/review-pull-requests-workflow.png",
      "alt": "Onglet Changements de la PR de démonstration ouverte, avec le diff de greeting et un avis d’autorisation GitHub indisponible.",
      "caption": "La véritable PR corrigée reste ouverte, sans fusion. Le diff supprime les espaces autour du nom et utilise World pour une valeur vide. Cette instance ne peut pas demander l’autorisation utilisateur GitHub ; le libellé de disponibilité ne donne pas le droit de fusionner et ne prouve pas que la CI du fournisseur a réussi.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1528,
        1148
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "delegate-code-work-workflow",
    "review-pull-requests-workflow"
  ]
}
---

Le travail sur le code part du dépôt lié au projet et s’exécute dans une sandbox serveur. Préparez le ticket et déléguez l’implémentation au worker de code de Numo, puis relisez la pull request liée et les contrôles du fournisseur avant de fusionner.

## Déléguer un ticket au worker de code {#delegate-code-work}

Le projet doit avoir un dépôt GitHub ou GitLab lié, une autorisation fournisseur valide et un sandbox serveur configuré. Vérifiez le modèle et le raisonnement du worker dans les paramètres IA du compte. Le modèle de conversation ne remplace pas ces réglages.

1. Ouvrez le ticket et décrivez le résultat attendu, les contraintes et les critères à vérifier.
2. Ouvrez Numo avec le contexte du ticket. Demandez une inspection du dépôt avant un plan technique. Des fichiers ou API non vérifiés ne constituent pas une preuve.
3. Demandez explicitement l’implémentation. Numo délègue les changements de branche au worker, qui clone le dépôt lié dans le sandbox serveur.
4. Suivez sa carte pour la progression, les fichiers, les contrôles et les questions. Répondez dans la conversation.
5. Ouvrez la pull request liée. Relisez le diff et les contrôles face aux critères avant de fusionner. Une prévisualisation existe seulement si le fournisseur de déploiement en a produit une.

![Carte du worker terminé avec modèle, raisonnement léger, deux fichiers modifiés, branche, PR n° 1 et commit corrigé.](/documentation/fr/delegate-code-work-workflow.png)

### Reprendre sans doublon {#continuation}

Un point de reprise peut permettre de continuer s’il a été conservé, sans garantir l’achèvement. Vérifiez la branche et la PR avant de relancer. Conservez les tâches cochées et les modifications concurrentes du plan. Les fichiers uniquement présents sur votre ordinateur sont indisponibles : poussez d’abord le code ou les skills nécessaires.

## Relire une pull request liée {#review-pull-requests}

Ouvrez la pull request liée à un ticket ou à une exécution déléguée. L’accès au dépôt reste nécessaire : être membre du projet ne donne pas les permissions du fournisseur Git.

Lisez la description et l’activité, puis les fichiers modifiés et les portions du diff. Ouvrez les discussions non résolues et répondez dans le fil concerné. Les marques de fichiers relus suivent votre lecture, sans constituer une approbation du fournisseur. Vérifiez les commits, les résultats CI et les tickets liés pour confirmer la couverture du travail demandé.

![Onglet Changements de la PR de démonstration ouverte, avec le diff de greeting et un avis d’autorisation GitHub indisponible.](/documentation/fr/review-pull-requests-workflow.png)

### Revue et fusion {#decision}

Demandez un reviewer si une seconde revue est nécessaire. Une revue IA disponible est un avis supplémentaire, pas la preuve que les tests passent. Contrôlez l’état brouillon ou prêt pour revue, les discussions ouvertes, les revues demandées et les règles de fusion du fournisseur.

Fusionnez après satisfaction des contrôles et revues applicables, avec un compte fournisseur autorisé. Une action visible peut être refusée par le fournisseur. Si l’état semble ancien, actualisez et vérifiez chez le fournisseur avant de répéter. Numo peut lire, commenter, modifier la disponibilité ou fusionner sur autorisation ; les changements de branche passent par le worker. Une prévisualisation dépend d’un véritable déploiement.
