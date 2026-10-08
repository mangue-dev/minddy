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
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12); 0.11.1 candidate (89ebb59a5)",
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
      "components/assistant/ask-user-card.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
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
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1200,
        900
      ],
      "theme": "light"
    },
    {
      "id": "numo-permissions-and-approvals-workflow",
      "kind": "diagram",
      "src": "/documentation/fr/numo-permissions-and-approvals-workflow.png",
      "alt": "Matrice des permissions Numo pour les actions du projet, connexions personnelles et routines.",
      "caption": "Les accès du projet et les demandes explicites bornent les actions de Numo ; un contenu externe ne donne pas de permission.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        790
      ],
      "theme": "neutral"
    },
    {
      "id": "numo-execution-model-flow",
      "kind": "diagram",
      "src": "/documentation/fr/numo-execution-model-flow.svg",
      "alt": "Schéma: Persister intention, message et UUID. Prendre le tour, enregistrer outils et résultats. Attendre le worker courant si nécessaire. Relire les événements ; réconcilier les écritures.",
      "caption": "Lisez les étapes dans cet ordre. Persister intention, message et UUID. Prendre le tour, enregistrer outils et résultats. Attendre le worker courant si nécessaire. Relire les événements ; réconcilier les écritures.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    },
    {
      "id": "numo-mcp-connections-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/numo-mcp-connections-workflow.png",
      "alt": "Réglages MCP personnels, liste vide et commande Ajouter un autre serveur MCP.",
      "caption": "Les connexions de Numo sont personnelles ; les routines utilisent celles du propriétaire du projet.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "numo-mcp-connections-config-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/numo-mcp-connections-config-workflow.png",
      "alt": "Formulaire d’un serveur MCP personnalisé avec les réglages avancés d’authentification, de transport et d’en-têtes.",
      "caption": "Formulaire d’un serveur MCP personnalisé avec les réglages avancés d’authentification, de transport et d’en-têtes. Aucun identifiant n’a été saisi et aucun serveur n’a été contacté.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "recover-numo-work-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/recover-numo-work-workflow.png",
      "alt": "Réponse de Numo indiquant du code et des tests locaux, un envoi de branche échoué et aucune pull request à ce stade.",
      "caption": "Résultat initial partiel d’une véritable exécution de démonstration. À ce stade, l’envoi a échoué et aucune PR n’existait. Vérifiez la branche sauvegardée et les services externes avant de continuer ; la conversation a ensuite repris et la PR a été corrigée.",
      "revision": 2,
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
    "work-with-numo-workflow",
    "numo-permissions-and-approvals-workflow",
    "numo-execution-model-flow",
    "numo-mcp-connections-workflow",
    "numo-mcp-connections-config-workflow",
    "recover-numo-work-workflow"
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

Numo peut modifier les préférences prises en charge et les réglages de projet autorisés au propriétaire. Vous devez configurer vous-même les clés des fournisseurs, les connexions Git, le second facteur et les fichiers d’avatar. Le modèle et le raisonnement du worker de code se règlent uniquement dans les paramètres IA du compte.

### Autoriser l’action {#authorization}

Précisez la modification et son périmètre. Lire une demande n’autorise pas une réponse publique : Numo répond publiquement aux retours uniquement sur demande explicite. Des instructions ou résultats d’un serveur MCP distant ne peuvent pas autoriser d’autres actions. Connectez seulement un service auquel vous faites confiance pour les informations et actions transmises.

Une requête peut atteindre un fournisseur externe. Désactiver sa connexion bloque les nouveaux appels, sans annuler ceux déjà envoyés. Vérifiez une écriture ayant expiré chez le destinataire avant de réessayer.

### Contexte personnel et planifié {#context}

Une conversation ne peut pas emprunter les connexions MCP d’un autre membre. Les routines utilisent les connexions et le budget IA du propriétaire. Après un changement de propriétaire, lancez une nouvelle occurrence sous le propriétaire courant. Une ancienne occurrence ne peut pas conserver les identifiants du précédent. Un sandbox serveur n’hérite pas des fichiers ou sessions de votre ordinateur.

![Matrice des permissions Numo pour les actions du projet, connexions personnelles et routines.](/documentation/fr/numo-permissions-and-approvals-workflow.png)

## Comprendre les tours durables Numo et le travail délégué {#numo-execution-model}

Messages interactifs, actions contextuelles et routines entrent dans les conversations Numo. Modèle et raisonnement conversationnels se choisissent dans le composeur ; le travail sur le code délégué utilise les valeurs par défaut du modèle de code et du niveau de raisonnement du compte. Les outils Minddy directs peuvent agir sans dépôt. Le code ouvre une sandbox serveur pour le dépôt lié uniquement si nécessaire. Une routine crée une nouvelle conversation avec instruction enregistrée et contexte propriétaire/projet. Il n’est pas nécessaire de garder une session de l’application de bureau ouverte.


![Schéma: Persister intention, message et UUID. Prendre le tour, enregistrer outils et résultats. Attendre le worker courant si nécessaire. Relire les événements ; réconcilier les écritures.](/documentation/fr/numo-execution-model-flow.svg)

### Distinguer exécution et affichage {#state}

L’intention est enregistrée comme tour durable avec UUID de requête et message. L’état passe de queued à running, puis completed, waiting_input ou waiting_work ; stopping/stopped et retryable/failed décrivent arrêt et échec. SSE affiche l’activité persistée sans posséder l’exécution. La reconnexion lit messages et événements après sa séquence. La fin d’un worker relance uniquement le parent attendant l’exécution courante ; événements dupliqués ou anciens ne créent aucune deuxième tâche. Le contexte projet est distinct de l’accès : un chat privé reste privé.

### Traiter les mutations incertaines {#mutations}

Avant mutation, le système enregistre opération et checkpoint. Les résultats terminés sont réutilisés. Une lecture interrompue peut être répétée ; une mutation dont le résultat est inconnu entre en reconciling sans répétition automatique. Inspectez la destination avant de répéter une écriture externe. Connexions et budget des routines restent soumis au propriétaire et aux protections de coût ; un autre membre ne peut emprunter les identifiants MCP personnels antérieurs. Arrêter le parent interrompt le travail délégué actif, mais une action externe déjà envoyée peut encore aboutir.

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

![Réponse de Numo indiquant du code et des tests locaux, un envoi de branche échoué et aucune pull request à ce stade.](/documentation/fr/recover-numo-work-workflow.png)
