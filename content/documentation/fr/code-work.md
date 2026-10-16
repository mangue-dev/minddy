---
{
  "id": "code-work",
  "locale": "fr",
  "title": "Travail de code et pull requests",
  "summary": "Confiez un ticket à votre propre agent de code avec un prompt copié et le MCP minddy, puis relisez et fusionnez la pull request liée.",
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
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-16",
  "compatibility": {
    "version": "0.11.1 candidate; MIN-721 removal of Numo code work (copied prompts and MCP for external agents, pull request review and merge retained)",
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
      "components/agent/use-agent-menu-actions.tsx",
      "components/agent/custom-prompt-dialog.tsx",
      "components/settings/account-preferences-section.tsx",
      "components/pull-requests/pr-detail.tsx",
      "components/pull-requests/pr-unresolved-conversations.tsx",
      "lib/server/agent/pr-mention.ts",
      "content/documentation/reviews/min-721-code-work-removal-2026-10-16.md"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution); agent:/root (account organization and official hosted-auth restriction source review; no provider rerun); agent:/root (native model controls and frozen launch source review; live auth outcomes recorded separately); agent:/root (worker card, explicit validation, PR handoff and footer source/component review; no new provider execution); agent:/root/min721_docs (MIN-721 source review inherited from en revision 9; fr translation of removal edits; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed); agent:/root (complete six-locale meaning review; agent review, not human acceptance); agent:/root (six-locale model-control meaning review; not human acceptance); agent:/root (six-locale card controls and delivery wording review; not human acceptance); agent:/root/min721_fr (fr translation of MIN-721 removal edits, equivalent meaning reviewed; agent review, not human acceptance)",
    "date": "2026-10-16"
  },
  "related": [
    "issues",
    "minddy-mcp",
    "git"
  ],
  "aliases": [
    "delegate-code-work",
    "plans-and-agents",
    "review-pull-requests"
  ],
  "tags": [
    "Confier un ticket à un agent de code externe",
    "Relire une pull request liée"
  ],
  "figures": [
    {
      "id": "review-pull-requests-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/review-pull-requests-workflow.png",
      "alt": "Onglet Changements de la PR de démonstration ouverte, avec le diff de greeting et un avis d’autorisation GitHub indisponible.",
      "caption": "PR de démonstration qui reste ouverte, sans fusion. Le diff supprime les espaces autour du nom et utilise World pour une valeur vide. Cette instance ne peut pas demander l’autorisation utilisateur GitHub ; le libellé de disponibilité ne donne pas le droit de fusionner et ne prouve pas que la CI du fournisseur a réussi.",
      "revision": 9,
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
    "review-pull-requests-workflow"
  ]
}
---

Minddy suit le travail ; votre propre agent de code, comme Claude Code, Codex ou Cursor, modifie le code. Copiez un prompt depuis le ticket, laissez l’agent lire et mettre à jour le ticket via le MCP minddy, puis relisez la pull request liée dans Minddy avant de la fusionner. Numo n’écrit pas de code, n’ouvre pas de branche et ne lance pas de tests.

## Confier un ticket à un agent de code externe {#external-coding-agents}

Connectez d’abord votre agent au MCP minddy pour qu’il puisse lire le plan et mettre à jour ses tâches ; consultez [Connecter un assistant externe au MCP minddy](/docs/minddy-mcp#external-minddy-mcp). L’agent s’exécute sur votre ordinateur ou dans son propre service, avec son propre abonnement ou ses propres coûts d’API. Minddy ne lui fournit pas d’accès au dépôt.

1. Ouvrez le ticket et décrivez le comportement attendu, les contraintes et les critères à vérifier. Rédigez ou relisez le plan dans son onglet Plan lorsque le travail comporte plusieurs étapes.
2. Ouvrez le menu d’actions du ticket et choisissez **Copier le prompt**. Choisissez **Générer un plan** (ou **Vérifier le plan** lorsqu’il en existe un) pour cadrer le travail sans coder, **Implémenter le ticket** pour lancer la modification, **Vérifier l'implémentation** pour que l’agent contrôle le travail terminé au regard du plan et des commentaires, ou **Personnalisé…** pour rédiger votre propre instruction.
3. Collez le prompt dans votre agent, dans la copie de travail du dépôt. La copie n’exécute aucun modèle d’IA et ne consomme aucun crédit IA.
4. Suivez l’avancement du plan dans le ticket à mesure que l’agent met à jour ses tâches via MCP. Répondez à ses questions dans l’agent, ou ajoutez les décisions au ticket pour que le prompt suivant les reprenne.

Le contenu du prompt, la suggestion de branche et les règles de langue sont décrits dans [Copier un prompt pour un autre agent de code](/docs/issues#copy-issue-prompt).

### Garder le travail lié au ticket {#link-work}

Lorsque le dépôt est lié au projet, conservez l’identifiant du ticket dans le nom de branche, le titre de la pull request ou une ligne `Fixes MIN-42`. Minddy rattache alors la pull request au ticket, et les prompts suivants demandent à l’agent de poursuivre la pull request ouverte sur sa branche.

Dans **Paramètres du compte → Préférences**, **Démarrer le ticket ou la tâche quand je copie son prompt** passe en cours un ticket ou une tâche de carnet pas encore démarré lorsque vous copiez son prompt. Laissez cette option désactivée si vous copiez des prompts uniquement pour les lire.

## Relire une pull request liée {#review-pull-requests}

Ouvrez la pull request liée à un ticket, ou retrouvez-la dans la liste des pull requests. L’accès au dépôt reste nécessaire : être membre du projet ne donne pas les permissions du fournisseur Git.

Lisez la description et l’activité, puis les fichiers modifiés et les portions du diff. Ouvrez les discussions non résolues et répondez dans le fil concerné plutôt que d’ajouter un commentaire sans lien. Pour renvoyer les retours restants à votre agent, ouvrez **Voir les conversations**, puis **Tout corriger** et **Copier le prompt**. Les marques de fichiers relus suivent votre lecture, sans constituer une approbation du fournisseur. Vérifiez les commits, les résultats CI et les tickets liés pour confirmer que la modification proposée couvre le travail demandé.

Mentionnez `@numo` dans un commentaire de pull request pour demander à Numo une relecture en lecture seule dans une conversation. Il lit la pull request et répond ; il ne pousse pas de commits. Une mention écrite sur le fournisseur Git n’est prise en compte que si son auteur est lié à un membre d’un projet qui lie le dépôt, et sa consommation est imputée au propriétaire de ce projet.

![Onglet Changements de la PR de démonstration ouverte, avec le diff de greeting et un avis d’autorisation GitHub indisponible.](/documentation/fr/review-pull-requests-workflow.png)

### Revue et fusion {#decision}

Demandez un reviewer si une seconde revue est nécessaire. Contrôlez l’état brouillon ou prêt pour revue, les discussions ouvertes, les revues demandées et les règles de fusion du fournisseur.

Fusionnez après satisfaction des contrôles et revues applicables, avec un compte fournisseur autorisé. **Fusionner avec Numo** laisse Numo rédiger le titre et la description du commit de fusion à partir de la pull request, puis fusionne dès qu’ils sont prêts. Une action visible peut être refusée par le fournisseur. Si l’état semble ancien, actualisez et vérifiez chez le fournisseur avant de répéter une action. Une prévisualisation liée dépend d’un véritable déploiement chez le fournisseur.
