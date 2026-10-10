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
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); MIN-676 private hosted native worker selection; MIN-676 frozen worker identity and proactive Numo context; MIN-676 split account AI settings, restricted native access and hosted authentication requirement",
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
      "components/pull-requests/pr-reviews-details.tsx",
      "components/settings/native-agent-connections.tsx",
      "components/settings/native-agent-connections.test.tsx",
      "app/api/account/agent-preferences/route.ts",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md",
      "components/agent/agent-engine-badge.tsx",
      "lib/server/assistant/account-worker-context.ts",
      "content/documentation/reviews/min-676-native-identity-2026-10-10.md",
      "content/documentation/reviews/min-676-account-ai-organization-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance)",
    "date": "2026-10-10"
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
      "caption": "Exemple historique OpenCode : Carte de la correction réelle de la PR existante, avec son commit actualisé et son lien. Relisez le diff et les contrôles avant de fusionner : le statut terminé ne suffit pas à valider les critères.",
      "revision": 6,
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
      "revision": 6,
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

Le projet doit avoir un dépôt GitHub ou GitLab lié, une autorisation fournisseur valide et une sandbox serveur configurée. Vérifiez **Agent de code** dans les paramètres IA du compte. OpenCode nécessite un modèle API compatible et un raisonnement configuré ; l’accès restreint à Codex et Claude Code nécessite la connexion du compte personnel sélectionné. Les valeurs du CLI natif sont indépendantes du modèle de conversation. Si l’accès natif échoue, reconnectez-vous ou choisissez explicitement OpenCode ; le travail ne bascule pas vers une facturation API.

L’authentification Codex par abonnement dans les services hébergés n’est pas disponible pour un usage général. OpenAI exclut explicitement l’authentification app-server des services hébergés et les oriente vers son programme Sign in with ChatGPT. Minddy doit utiliser une intégration autorisée avant son ouverture. Les tests techniques restreints existants ne prouvent ni l’autorisation, ni le renouvellement réel des tokens, ni un lancement sans reprise. L’exécution payante de Claude Code reste non testée. Retirer les badges de l’interface ne change pas ces conditions de disponibilité. [Codex / Claude Code](/docs/ai-settings-and-usage#native-agent-preview).

La carte de travail délégué, les détails de l’agent et sa conversation affichent le moteur de cette exécution : **Codex**, **Claude Code** ou **OpenCode**, avec son logo. Cette identité est enregistrée au démarrage. Modifier les paramètres du compte concerne les nouveaux agents ; cela ne renomme pas une exécution existante. Les anciennes exécutions sans moteur enregistré affichent un libellé générique d’agent de code.

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
