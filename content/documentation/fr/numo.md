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
  "revision": 22,
  "sourceRevision": 22,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-28",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/assistant/usage-exhausted-card.tsx",
      "components/assistant/ask-user-card.tsx",
      "lib/server/numo/request-stop.test.ts",
      "supabase/migrations/20270109200042_numo_stop_preserves_workers.sql",
      "lib/server/numo/turns.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/assistant/assistant-context-bar.tsx",
      "lib/use-ask-numo-about-selection.ts",
      "lib/assistant-selection.ts",
      "lib/server/issue-reads.ts",
      "components/settings/account-settings-page.tsx",
      "lib/settings-sections.ts",
      "lib/server/assistant/conversation-attachments.ts",
      "lib/server/assistant/markdown-pdf.ts",
      "components/assistant/generated-file-cards.tsx"
    ]
  },
  "review": {
    "revision": 22,
    "fact": "agent:claude-code (new paragraph on asking Numo about a selected passage, checked against lib/use-ask-numo-about-selection.ts, lib/assistant-context.ts and components/assistant/assistant-shell.tsx; not checked in the running app; no figure recaptured, existing figures still match; earlier evidence retained in git history)",
    "language": "agent:claude-code (fr translation of the added paragraph with catalog UI labels; formal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-28"
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
    "Comprendre les tours durables de Numo",
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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
      "revision": 22,
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
      "alt": "Schéma: Persister intention, message et UUID. Prendre le tour, enregistrer outils et résultats. Attendre votre réponse si une précision est requise. Relire les événements ; réconcilier les écritures.",
      "caption": "Lisez les étapes dans cet ordre. Persister intention, message et UUID. Prendre le tour, enregistrer outils et résultats. Attendre votre réponse si une précision est requise. Relire les événements ; réconcilier les écritures.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-16",
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
            "title": "Attendre votre réponse si une précision est requise"
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
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "alt": "Assistant de connexion à Notion affichant la méthode de connexion connue du catalogue.",
      "caption": "Étape de connexion d’un service du catalogue. Aucun identifiant n’a été saisi et aucun serveur n’a été contacté.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-21",
      "viewport": [
        560,
        354
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

Numo travaille à partir du contexte de votre conversation et des permissions de votre compte. Commencez par une demande délimitée et vérifiez son résultat. Les sections sur les permissions et l’exécution expliquent le travail planifié ; en cas d’attente ou d’échec, inspectez l’état enregistré avant de répéter une demande.

## Réaliser une tâche du projet avec Numo {#work-with-numo}

Ouvrez le ticket ou le projet concerné, puis utilisez le bouton flottant Numo. La page courante devient le contexte de la conversation. Les actions contextuelles qui confient du travail à Numo ouvrent ce même panneau. Vous devez avoir accès au projet et disposer d’un budget IA ou d’une clé personnelle compatible.

1. Vérifiez le contexte affiché dans la zone de saisie. Nommez le ticket si plusieurs éléments sont concernés. Pour ajouter un ticket au contexte, tapez `@` dans la zone de saisie ou utilisez **Ajouter du contexte** → **Ticket** ; une description liste aussi des tickets trouvés [par le sens](/docs/navigation#search-by-meaning) sous **Liés par le sens**.
2. Choisissez le fournisseur, le modèle et le niveau de raisonnement de la conversation avec le logo du fournisseur, à côté du micro ; le survoler affiche le modèle actuel. Lorsque le modèle n’offre aucun réglage du raisonnement, le curseur reste sur **Sans raisonnement** ; sur un modèle qui raisonne toujours, **Sans raisonnement** utilise son niveau le plus léger.
3. Envoyez une demande délimitée, par exemple : « Lis ce ticket et propose des critères d’acceptation. Ne change pas son statut. »
4. Lisez la réponse et suivez les liens vers les tickets ou les sources. Pour une modification, ouvrez l’objet concerné et contrôlez le résultat.

Dans une nouvelle conversation vide, quatre lignes de suggestions au-dessus du champ de saisie proposent des demandes adaptées à la page actuelle, par exemple **Résumer ce ticket** ou **Écrire un plan d’implémentation** lorsqu’un ticket est ouvert dans le panneau latéral. Choisir une ligne remplit le champ de saisie sans l’envoyer : vous pouvez d’abord modifier la demande. Les lignes disparaissent dès que le champ contient du texte et reviennent quand vous le videz. Elles apparaissent dans la mise en page de bureau, pas sur un téléphone.

Pour interroger Numo sur un passage, sélectionnez-le dans un éditeur, par exemple une page ou la description d’un ticket, puis choisissez **Demander à Numo** dans la barre d’outils de sélection, sur ordinateur. Le panneau s’ouvre sans rien envoyer : à côté de la page ou du ticket d’où il vient, le passage apparaît comme une pastille de contexte qui affiche ses premiers mots, et le survol de la pastille affiche le passage entier. Saisissez votre question, par exemple « Reformule ce passage plus brièvement » ou « Crée des tickets à partir de ce passage », puis envoyez-la. Le passage accompagne ce seul message. Pour ne pas l’envoyer, retirez sa pastille avec sa croix.

Numo peut aussi regarder les images d’une description de ticket ou d’objectif, d’un plan, d’un commentaire, d’une page ou de votre carnet lorsque le modèle de la conversation accepte les images. Sans cette capacité, Numo indique qu’il n’a pas pu voir l’image au lieu de la décrire.

Numo peut aussi rédiger un fichier à télécharger : un rapport ou un document en PDF, un export en CSV, ou un fichier texte, Markdown, HTML, JSON, XML, SVG ou calendrier. Demandez-le dans votre requête ; Numo peut le construire à partir des fichiers ajoutés à la conversation. Le fichier apparaît dans une carte sous sa réponse : un clic sur la carte ouvre son aperçu quand le format le permet, **Télécharger** l’enregistre, et le menu voisin propose **Aperçu** et **Copier le contenu**. Le fichier reste dans le stockage privé de votre conversation ; pour le partager avec le projet, demandez à Numo de le joindre à un ticket, à un objectif ou à un commentaire qu’il y publie. Un PDF utilise les polices standard : les caractères hors des alphabets d’Europe de l’Ouest et les emoji n’y figurent pas.

Le modèle par défaut de Numo vient de **Paramètres du compte → IA et Numo → Modèle par défaut de Numo** : le réglage de l’app ou un modèle personnel pour le fournisseur actif. Un choix explicite dans la conversation est prioritaire. Consultez [les paramètres IA et l’usage](/docs/ai-settings-and-usage#ai-keys-and-models).

![Conversation de démonstration Numo avec contexte, demande de changement de priorité et réponse enregistrée.](/documentation/fr/work-with-numo-workflow.png)

### Continuer une conversation {#continue}

La liste des conversations permet de retrouver les échanges précédents. Continuez la conversation qui contient les décisions utiles. Numo organise et suit le travail : il lit et met à jour les tickets, les plans, les pages et les autres contenus Minddy, et peut lire les pull requests liées. À votre demande, il peut aussi commenter une pull request, résoudre les conversations de revue déjà traitées et la fusionner. Quand Numo cherche des tickets, les correspondances textuelles et les identifiants exacts passent en premier ; une recherche descriptive peut ajouter des tickets du même projet trouvés par le sens, que Numo doit vérifier avant de s’y fier. Il n’écrit pas de code et ne pousse pas de commits. Pour faire écrire du code, copiez le prompt du ticket pour votre propre agent de code ; consultez [Travail de code et pull requests](/docs/code-work#external-coding-agents).

Si Numo demande une précision, envoyez votre choix avant d’attendre la suite des actions qui en dépendent. Une carte de consommation ou d’erreur explique l’arrêt. Vérifiez toute écriture externe avant de demander de la répéter.

## Comprendre les permissions de Numo {#numo-permissions-and-approvals}

Numo agit dans les limites des droits et du rôle de l’utilisateur courant. Une demande dans le chat ne donne pas à un membre accès aux réglages réservés au propriétaire. Le Numo d’un lecteur, dans le chat ou via `@Numo` dans un commentaire qu’il a le droit de publier, n’utilise que des outils de lecture et sa consommation est imputée au lecteur. Celui-ci gère les membres, les intégrations, le dépôt et les réglages du tableau de retours. Les réglages personnels appartiennent au compte courant.

Numo peut modifier les préférences prises en charge et les réglages de projet autorisés au propriétaire. Vous configurez vous-même les clés des fournisseurs, les connexions Git, le second facteur et les fichiers d’avatar.

### Autoriser l’action {#authorization}

Précisez la modification et son périmètre. Lire une demande n’autorise pas une réponse publique : Numo répond publiquement aux retours uniquement sur demande explicite. Des instructions ou résultats d’un serveur MCP distant ne peuvent pas autoriser d’autres actions. Connectez seulement un service auquel vous faites confiance pour les informations et actions transmises.

Une requête peut atteindre un fournisseur externe. Désactiver sa connexion bloque les nouveaux appels, sans annuler ceux déjà envoyés. Vérifiez une écriture ayant expiré chez le destinataire avant de réessayer.

### Contexte personnel et planifié {#context}

Une conversation ne peut pas emprunter les connexions MCP d’un autre membre. Les routines utilisent les connexions et le budget IA du propriétaire. Après un transfert de propriété, les routines de l’ancien propriétaire dans le projet sont mises en pause ; le nouveau propriétaire crée les routines qui doivent continuer. Une ancienne occurrence ne peut pas conserver les identifiants du précédent. Numo s’exécute sur le serveur : il ne lit pas les fichiers de votre ordinateur et n’utilise pas vos sessions personnelles.

![Matrice des permissions Numo pour les actions du projet, connexions personnelles et routines.](/documentation/fr/numo-permissions-and-approvals-workflow.svg)

## Comprendre les tours durables de Numo {#numo-execution-model}

Les messages interactifs, actions contextuelles et routines entrent dans les conversations Numo. Le modèle et le raisonnement de conversation se choisissent dans le composeur. Numo agit avec ses outils Minddy et les connexions MCP personnelles que vous avez ajoutées ; il n’a besoin d’aucun dépôt. Une routine crée une nouvelle conversation avec l’instruction enregistrée et le contexte propriétaire/projet. Aucune session de bureau ne doit rester ouverte.

![Schéma: Persister intention, message et UUID. Prendre le tour, enregistrer outils et résultats. Attendre votre réponse si une précision est requise. Relire les événements ; réconcilier les écritures.](/documentation/fr/numo-execution-model-flow.svg)

### Distinguer exécution et affichage {#state}

Chaque demande est enregistrée comme une exécution durable avec son UUID de requête et son message. L’état passe de `queued` à `running`, puis à `completed` ou `waiting_input` ; `stopping`/`stopped` et `retryable`/`failed` décrivent l’interruption et l’échec. SSE affiche l’activité enregistrée sans piloter l’exécution. À la reconnexion, l’affichage reprend les messages et événements après la dernière séquence reçue. Les événements dupliqués ou anciens ne créent pas de deuxième tâche. Le contexte projet reste distinct de l’accès : une conversation réservée au propriétaire reste privée.

### Traiter les mutations incertaines {#mutations}

Avant une modification, le système enregistre l’opération et son point de reprise. Les résultats terminés sont réutilisés. Une lecture interrompue peut être répétée ; une modification dont le résultat est inconnu passe à l’état `reconciling`, sans répétition automatique. Inspectez la destination avant de répéter une écriture externe. Les connexions et le budget des routines restent soumis aux règles de propriété et de coût ; un autre membre ne peut pas utiliser les identifiants MCP personnels de l’ancien propriétaire.

Arrêter Numo termine son tour. Une action externe déjà envoyée peut encore aboutir. Une conversation qui attendait du travail de code lancé par une version antérieure est arrêtée automatiquement et revient au repos.

## Connecter un service MCP personnel à Numo {#numo-mcp-connections}

Dans les paramètres du compte, ouvrez **IA et Numo** et utilisez la carte **MCP pour Numo**. Les liens vers l’ancien onglet MCP pour Numo y mènent. Choisissez un service du catalogue ou ajoutez un serveur MCP HTTPS public. Le catalogue et la recherche du registre ne contournent pas l’inscription ou l’approbation du fournisseur. Numo peut préparer une connexion dans une conversation interactive ; une routine autonome ne peut pas en créer.

La connexion se fait dans un assistant en plusieurs étapes. Un serveur personnalisé ou issu du registre demande d’abord son nom et son adresse HTTPS ; un service du catalogue s’ouvre directement sur l’étape de connexion. Un service du catalogue, une connexion enregistrée ou une entrée du registre qui déclare un jeton connaît déjà sa méthode de connexion : l’étape l’affiche, et **Utiliser une autre méthode** permet d’en changer. Sinon, choisissez **Se connecter avec OAuth**, **Jeton Bearer** ou **Sans authentification**. Les **Paramètres avancés** contiennent le transport (Streamable HTTP par défaut, SSE historique pris en charge) et les en-têtes chiffrés. Placez les secrets dans les identifiants ou en-têtes, jamais l’URL. Les commandes locales et réseaux privés sont exclus. Pour une application OAuth existante, enregistrez l’URL de rappel affichée et saisissez son identifiant et secret. Après l’enregistrement, la dernière étape attend la connexion, puis teste le serveur et indique combien d’outils Numo a trouvés. Sur desktop, OAuth ouvre le navigateur système puis revient à l’application.

![Réglages MCP personnels, liste vide et commande Ajouter un autre serveur MCP.](/documentation/fr/numo-mcp-connections-workflow.png)

### Tester, reconnecter et supprimer {#manage}

Le menu permet test, modification, reconnexion, désactivation et suppression. Une alerte orange d’authentification nécessite une reconnexion. Les champs secrets vides conservent les valeurs ; changer l’URL efface identifiants et en-têtes. Le contrôle dédié supprime le jeton bearer ; `{}` efface les en-têtes.

La désactivation bloque les nouveaux appels, pas ceux envoyés. Les limites sont 30 secondes, 1 MiB de transport et 64 KB de résultat. Vérifiez les écritures expirées chez le destinataire avant de réessayer. Les routines utilisent les connexions du propriétaire, sans prêt aux autres membres.

![Assistant de connexion à Notion affichant la méthode de connexion connue du catalogue.](/documentation/fr/numo-mcp-connections-config-workflow.png)

## Reprendre un travail Numo arrêté ou en attente {#recover-numo-work}

Revenez à la conversation et lisez ses derniers messages et ses cartes. Distinguez une question en attente, une limite du compte, un plafond de routine, une allocation d’opération épuisée et une erreur technique. Fermer le panneau ne prouve pas que le travail s’est arrêté.

Dans une carte de questions active, répondez à toutes les questions requises puis envoyez l’ensemble. Les anciennes cartes sont des traces, sans nouvel envoi possible. Passer une question ne fournit pas l’information manquante et n’autorise pas les modifications qui en dépendent.

### Budget et erreurs {#recovery}

La carte de limite du compte affiche la date de réinitialisation lorsqu’elle est connue et peut proposer un forfait ou une clé personnelle. Celle d’une routine mène à sa gestion : vérifiez le plafond par exécution. L’allocation d’opération concerne cette opération. Répéter la demande ne supprime pas la limite.

Une exécution échouée reprend depuis un point sauvegardé seulement s’il subsiste. Vérifiez tickets, pages et services externes avant de relancer : une écriture peut avoir réussi malgré une réponse perdue. Précisez le travail restant et demandez de continuer. Sans point récupérable, transmettez l’état vérifié dans une nouvelle demande. Pour signaler une erreur persistante, indiquez la conversation concernée sans identifiants secrets.

## Choisir un objectif pour un retour {#feedback-objectives}

Les objectifs des retours nécessitent un choix explicite. Demandez à Numo de lier une demande à un objectif nommé du projet, ou de retirer ce lien ; Numo résout le retour et l’objectif avant la modification. Une revue ou une catégorisation générale n’autorise pas l’affectation d’un objectif. Une intégration peut fournir un objectif choisi par le propriétaire. La conversion reprend l’objectif et les catégories du retour ; elle laisse l’objectif vide si aucun n’a été choisi.
