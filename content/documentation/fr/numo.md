---
{
  "id": "numo",
  "locale": "fr",
  "title": "Numo",
  "summary": "Travaillez avec Numo, comprenez ses permissions et son exécution, connectez des services MCP et reprenez le travail en attente ou interrompu.",
  "topic": "Numo et intégrations",
  "type": "guide",
  "audiences": [
    "member",
    "owner",
    "integrator",
    "operator"
  ],
  "workflows": [
    "N01",
    "N02",
    "T05",
    "N08",
    "N05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); 0.11.1 candidate (89ebb59a5); MIN-676 private hosted native worker selection; MIN-676 frozen worker identity and proactive Numo context",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop",
      "full",
      "managed"
    ],
    "evidence": [
      "content/knowledge/agents-and-mcp.md",
      "components/assistant-panel.tsx",
      "components/assistant/chat-input.tsx",
      "content/knowledge/settings-and-data.md",
      "lib/server/assistant/tools.ts",
      "docs/architecture/numo-persistence.md",
      "docs/architecture/numo-durable-turns.md",
      "components/settings/account-mcp-section.tsx",
      "app/api/account/mcp-connections/route.ts",
      "components/settings/account-mcp-clients.tsx",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/premerge-de-es-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md",
      "content/documentation/reviews/min-670-feedback-objectives.md",
      "components/settings/native-agent-connections.tsx",
      "components/settings/native-agent-connections.test.tsx",
      "app/api/account/agent-preferences/route.ts",
      "content/documentation/reviews/min-676-native-worker-selection-2026-10-10.md",
      "components/agent/agent-engine-badge.tsx",
      "lib/server/assistant/account-worker-context.ts",
      "content/documentation/reviews/min-676-native-identity-2026-10-10.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root (MIN-670 source, fr wording and new-control review; existing procedural evidence retained); agent:/root/native_hosting_terms (private worker selection controls and fail-closed recovery source/UI-test review; no paid Claude execution or new provider rehearsal claimed); agent:/root/native_identity_docs (frozen identity and proactive context source review; prior operational evidence retained, no new provider execution)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root (MIN-670 source, fr wording and new-control review; existing procedural evidence retained); agent:/root/native_hosting_terms (localized worker selection additions and equivalent meaning; agent review, no human acceptance claimed); agent:/root/native_identity_docs (localized additions and complete equivalent meaning; agent review, no human acceptance claimed)",
    "date": "2026-10-10"
  },
  "related": [
    "code-work",
    "minddy-mcp",
    "architecture-and-data-flows",
    "integration-troubleshooting"
  ],
  "aliases": [
    "work-with-numo",
    "agents-and-mcp",
    "numo-permissions-and-approvals",
    "numo-execution-model",
    "numo-mcp-connections",
    "recover-numo-work"
  ],
  "tags": [
    "Réaliser une tâche du projet avec Numo",
    "Comprendre les permissions de Numo",
    "Comprendre les tours durables Numo et le travail délégué",
    "Connecter un service MCP personnel à Numo",
    "Reprendre un travail Numo arrêté ou en attente"
  ],
  "figures": [
    {
      "id": "work-with-numo-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/work-with-numo-workflow.png",
      "alt": "Conversation de démonstration Numo avec contexte, demande de changement de priorité et réponse enregistrée.",
      "caption": "Fil de démonstration existant, localisé pour l’affichage. La réponse enregistrée cite AUR-11 et AUR-7 ; la capture ne prouve pas une nouvelle exécution.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        498,
        648
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "numo-permissions-and-approvals-workflow",
      "kind": "diagram",
      "src": "/documentation/fr/numo-permissions-and-approvals-workflow.svg",
      "alt": "Matrice des permissions Numo pour les actions du projet, connexions personnelles et routines.",
      "caption": "Les accès du projet et les demandes explicites bornent les actions de Numo ; un contenu externe ne donne pas de permission.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        790
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "matrix",
        "title": "Numo : accès et autorisation",
        "headers": [
          "Action ou contexte",
          "Qui autorise",
          "Limite"
        ],
        "rows": [
          [
            "Travail du projet",
            "Membre ayant accès au projet",
            "Les permissions du projet restent applicables"
          ],
          [
            "Réglages du propriétaire",
            "Propriétaire du projet",
            "Membres, repository et réglages des retours"
          ],
          [
            "Identifiants et sécurité",
            "Titulaire du compte, dans les réglages",
            "Configurer directement clés, Git et double authentification"
          ],
          [
            "Réponse publique à un retour",
            "Demande explicite de l’utilisateur",
            "Lire une demande n’autorise pas une réponse publique"
          ],
          [
            "MCP personnel",
            "Auteur de la conversation",
            "Pas de connexions personnelles d’un autre membre"
          ],
          [
            "Routine planifiée",
            "Propriétaire actuel du projet",
            "Connexions et budget IA du propriétaire"
          ],
          [
            "Résultat MCP distant",
            "Contenu externe non fiable",
            "Ne peut pas autoriser des actions supplémentaires"
          ]
        ]
      }
    },
    {
      "id": "numo-execution-model-flow",
      "kind": "diagram",
      "src": "/documentation/fr/numo-execution-model-flow.svg",
      "alt": "Schéma: Persister intention, message et UUID. Prendre le tour, enregistrer outils et résultats. Attendre le worker courant si nécessaire. Relire les événements ; réconcilier les écritures.",
      "caption": "Lisez les étapes dans cet ordre. Persister intention, message et UUID. Prendre le tour, enregistrer outils et résultats. Attendre le worker courant si nécessaire. Relire les événements ; réconcilier les écritures.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "items": [
          {
            "title": "Persister intention, message et UUID"
          },
          {
            "title": "Prendre le tour, enregistrer outils et résultats"
          },
          {
            "title": "Attendre le worker courant si nécessaire"
          },
          {
            "title": "Relire les événements ; réconcilier les écritures"
          }
        ]
      }
    },
    {
      "id": "numo-mcp-connections-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/numo-mcp-connections-workflow.png",
      "alt": "Réglages MCP personnels, liste vide et commande Ajouter un autre serveur MCP.",
      "caption": "Les connexions de Numo sont personnelles ; les routines utilisent celles du propriétaire du projet.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        1314
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "numo-mcp-connections-config-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/numo-mcp-connections-config-workflow.png",
      "alt": "Formulaire d’un serveur MCP personnalisé avec les réglages avancés d’authentification, de transport et d’en-têtes.",
      "caption": "Formulaire d’un serveur MCP personnalisé avec les réglages avancés d’authentification, de transport et d’en-têtes. Aucun identifiant n’a été saisi et aucun serveur n’a été contacté.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        560,
        920
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "work-with-numo-workflow",
    "numo-permissions-and-approvals-workflow",
    "numo-execution-model-flow",
    "numo-mcp-connections-workflow",
    "numo-mcp-connections-config-workflow"
  ]
}
---

Numo travaille à partir du contexte de votre conversation et des permissions de votre compte. Commencez par une demande délimitée et vérifiez son résultat. Les sections sur les permissions et l’exécution expliquent le travail délégué ou planifié ; en cas d’attente ou d’échec, inspectez l’état enregistré avant de répéter une demande.

## Réaliser une tâche du projet avec Numo {#work-with-numo}

Ouvrez le ticket ou le projet concerné, puis utilisez le bouton flottant Numo. La page courante devient le contexte de la conversation. Les actions contextuelles qui confient du travail à Numo ouvrent ce même panneau. Vous devez avoir accès au projet et disposer d’un budget IA ou d’une clé personnelle compatible.

1. Vérifiez le contexte affiché dans la zone de saisie. Nommez le ticket si plusieurs éléments sont concernés.
2. Choisissez le modèle et le niveau de raisonnement de la conversation. Le worker de code utilise des réglages distincts du compte.
3. Envoyez une demande délimitée, par exemple : « Lis ce ticket et propose des critères d’acceptation. Ne change pas son statut. »
4. Lisez la réponse et suivez les liens vers les tickets ou les sources. Pour une modification, ouvrez l’objet concerné et contrôlez le résultat.

![Conversation de démonstration Numo avec contexte, demande de changement de priorité et réponse enregistrée.](/documentation/fr/work-with-numo-workflow.png)

### Continuer ou déléguer {#continue}

La liste des conversations permet de retrouver les échanges précédents. Continuez la conversation qui contient les décisions utiles. Pour modifier un dépôt, Numo délègue à un worker dans un sandbox serveur et affiche la progression, les fichiers, les contrôles et la pull request. Il ne travaille pas dans votre dossier local.

Si Numo demande une précision, envoyez votre choix avant d’attendre la suite des actions qui en dépendent. Une carte de consommation ou d’erreur explique l’arrêt. Vérifiez toute écriture externe avant de demander de la répéter.

## Comprendre les permissions de Numo {#numo-permissions-and-approvals}

Numo agit dans les limites des droits de l’utilisateur courant. Une demande dans le chat ne donne pas à un membre accès aux réglages réservés au propriétaire. Celui-ci gère les membres, les intégrations, le dépôt et les réglages du tableau de retours. Les réglages personnels appartiennent au compte courant.

Numo peut modifier les préférences prises en charge et les réglages de projet autorisés au propriétaire. Vous configurez vous-même les clés des fournisseurs, les connexions aux abonnements natifs, les connexions Git, le second facteur et les fichiers d’avatar. L’agent de code, ainsi que le modèle et le raisonnement OpenCode, se choisissent uniquement dans les paramètres IA du compte.

### Autoriser l’action {#authorization}

Précisez la modification et son périmètre. Lire une demande n’autorise pas une réponse publique : Numo répond publiquement aux retours uniquement sur demande explicite. Des instructions ou résultats d’un serveur MCP distant ne peuvent pas autoriser d’autres actions. Connectez seulement un service auquel vous faites confiance pour les informations et actions transmises.

Une requête peut atteindre un fournisseur externe. Désactiver sa connexion bloque les nouveaux appels, sans annuler ceux déjà envoyés. Vérifiez une écriture ayant expiré chez le destinataire avant de réessayer.

### Contexte personnel et planifié {#context}

Une conversation ne peut pas emprunter les connexions MCP d’un autre membre. Les routines utilisent les connexions et le budget IA du propriétaire. Après un changement de propriétaire, lancez une nouvelle occurrence sous le propriétaire courant. Une ancienne occurrence ne peut pas conserver les identifiants du précédent. Un sandbox serveur n’hérite pas des fichiers ou sessions de votre ordinateur.

![Matrice des permissions Numo pour les actions du projet, connexions personnelles et routines.](/documentation/fr/numo-permissions-and-approvals-workflow.svg)

## Comprendre l’exécution Numo et le travail délégué {#numo-execution-model}

Les messages interactifs, actions contextuelles et routines entrent dans les conversations Numo. Le modèle et le raisonnement de conversation se choisissent dans le composeur. Le travail délégué sur un dépôt utilise l’agent de code choisi dans les paramètres IA du compte : OpenCode utilise son modèle API et son raisonnement configurés ; Codex ou Claude Code utilise l’abonnement personnel connecté et les valeurs du CLI dans l’aperçu privé. Les outils Minddy directs peuvent agir sans dépôt. Le travail de code ouvre une sandbox serveur hébergée pour le dépôt lié uniquement si nécessaire. Une routine crée une nouvelle conversation avec l’instruction enregistrée et le contexte propriétaire/projet. Aucune session de bureau ne doit rester ouverte. [Codex / Claude Code](/docs/ai-settings-and-usage#native-agent-preview).

Avant de déléguer, Numo reçoit le choix actuel du compte et les capacités de l’adaptateur sélectionné. Une fois l’agent lancé, son moteur et ses capacités enregistrés font référence pour cette exécution, même après une modification des paramètres du compte. Numo nomme cet agent lorsqu’il explique le travail délégué. Si le choix du compte est inaccessible, il vérifie les paramètres au lieu de le deviner.

L’aperçu natif expose les outils Minddy contrôlés via MCP. Les outils intégrés natifs du fournisseur, les images en entrée et les sous-agents ne sont pas disponibles dans ces adaptateurs. Il transmet les questions de l’agent à partir du contexte fiable de la conversation, ou vous interroge lorsqu’une décision manque. Numo peut utiliser ses propres outils pris en charge dans les limites de votre autorisation ; il n’invente pas d’opérations non prises en charge par le moteur.


![Schéma: Persister intention, message et UUID. Prendre le tour, enregistrer outils et résultats. Attendre le worker courant si nécessaire. Relire les événements ; réconcilier les écritures.](/documentation/fr/numo-execution-model-flow.svg)

### Distinguer exécution et affichage {#state}

Chaque demande est enregistrée comme une exécution durable avec son UUID de requête et son message. L’état passe de `queued` à `running`, puis à `completed`, `waiting_input` ou `waiting_work` ; `stopping`/`stopped` et `retryable`/`failed` décrivent l’interruption et l’échec. SSE affiche l’activité enregistrée sans piloter l’exécution. À la reconnexion, l’affichage reprend les messages et événements après la dernière séquence reçue. La fin d’un worker relance le parent en attente uniquement pour l’exécution courante ; les événements dupliqués ou anciens ne créent pas de deuxième tâche. Le contexte projet reste distinct de l’accès : une conversation réservée au propriétaire reste privée.

### Traiter les mutations incertaines {#mutations}

Avant une modification, le système enregistre l’opération et son point de reprise. Les résultats terminés sont réutilisés. Une lecture interrompue peut être répétée ; une modification dont le résultat est inconnu passe à l’état `reconciling`, sans répétition automatique. Inspectez la destination avant de répéter une écriture externe. Les connexions et le budget des routines restent soumis aux règles de propriété et de coût ; un autre membre ne peut pas utiliser les identifiants MCP personnels de l’ancien propriétaire. Arrêter le parent interrompt le travail délégué actif, mais une action externe déjà envoyée peut encore aboutir.

## Connecter un service MCP personnel à Numo {#numo-mcp-connections}

Dans les paramètres du compte, ouvrez MCP pour Numo. Choisissez un service du catalogue ou ajoutez un serveur MCP HTTPS public. Le catalogue et la recherche du registre ne contournent pas l’inscription ou l’approbation du fournisseur. Numo peut préparer une connexion dans une conversation interactive ; une routine autonome ne peut pas en créer.

Utilisez OAuth ou les réglages avancés pour un jeton bearer, aucune authentification ou des en-têtes chiffrés. Streamable HTTP est le transport par défaut ; SSE historique est pris en charge. Placez les secrets dans les identifiants ou en-têtes, jamais l’URL. Les commandes locales et réseaux privés sont exclus. Pour une application OAuth existante, enregistrez l’URL de rappel affichée et saisissez son identifiant et secret. Sur desktop, OAuth ouvre le navigateur système puis revient à l’application.

![Réglages MCP personnels, liste vide et commande Ajouter un autre serveur MCP.](/documentation/fr/numo-mcp-connections-workflow.png)

### Tester, reconnecter et supprimer {#manage}

Le menu permet test, modification, reconnexion, désactivation et suppression. Une alerte orange d’authentification nécessite une reconnexion. Les champs secrets vides conservent les valeurs ; changer l’URL efface identifiants et en-têtes. Le contrôle dédié supprime le jeton bearer ; `{}` efface les en-têtes.

La désactivation bloque les nouveaux appels, pas ceux envoyés. Les limites sont 30 secondes, 1 MiB de transport et 64 KB de résultat. Vérifiez les écritures expirées chez le destinataire avant de réessayer. Les routines utilisent les connexions du propriétaire, sans prêt aux autres membres.

![Formulaire d’un serveur MCP personnalisé avec les réglages avancés d’authentification, de transport et d’en-têtes.](/documentation/fr/numo-mcp-connections-config-workflow.png)

## Reprendre un travail Numo arrêté ou en attente {#recover-numo-work}

Revenez à la conversation et lisez ses derniers messages et la carte du worker. Distinguez une question en attente, une limite du compte, un plafond de routine, une allocation d’opération épuisée et une erreur technique. Fermer le panneau ne prouve pas que le travail s’est arrêté.

Dans une carte de questions active, répondez à toutes les questions requises puis envoyez l’ensemble. Les anciennes cartes sont des traces, sans nouvel envoi possible. Passer une question ne fournit pas l’information manquante et n’autorise pas les modifications qui en dépendent.

### Budget et erreurs {#recovery}

La carte de limite du compte affiche la date de réinitialisation lorsqu’elle est connue et peut proposer un forfait ou une clé personnelle. Celle d’une routine mène à sa gestion : vérifiez le plafond par exécution. L’allocation d’opération concerne cette opération. Répéter la demande ne supprime pas la limite. Une clé personnelle ne rend pas le calcul du sandbox gratuit.

Une exécution échouée reprend depuis un point sauvegardé seulement s’il subsiste. Vérifiez tickets, branche, PR et services externes avant de relancer : une écriture peut avoir réussi malgré une réponse perdue. Précisez le travail restant et demandez de continuer. Sans point récupérable, transmettez l’état vérifié dans une nouvelle demande. Pour signaler une erreur persistante, indiquez la conversation concernée sans identifiants secrets.


## Choisir un objectif pour un retour {#feedback-objectives}

Les objectifs des retours nécessitent un choix explicite. Demandez à Numo de lier une demande à un objectif nommé du projet, ou de retirer ce lien ; Numo résout le retour et l’objectif avant la modification. Une revue ou une catégorisation générale n’autorise pas l’affectation d’un objectif. Une intégration peut fournir un objectif choisi par le propriétaire. La conversion reprend l’objectif et les catégories du retour ; elle laisse l’objectif vide si aucun n’a été choisi.
