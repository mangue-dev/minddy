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
  "revision": 33,
  "sourceRevision": 33,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-08",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "components/assistant/generated-file-cards.tsx",
      "components/assistant/assistant-starter-list.tsx",
      "app/(app)/home/page.tsx",
      "lib/keyboard/typeahead.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/assistant/assistant-shell.tsx",
      "components/assistant/chat-message.tsx",
      "components/typed-mention-chip.tsx",
      "lib/server/assistant/prompt.ts",
      "lib/server/numo-notes.ts",
      "lib/server/numo/memory-prompt.ts",
      "components/settings/account-numo-memory-section.tsx",
      "lib/server/assistant/long-message.ts",
      "lib/server/assistant/create-page-database.ts",
      "lib/server/numo/journal-content.ts",
      "lib/server/numo/journal-prompt.ts",
      "lib/server/numo/wake.ts",
      "lib/server/assistant/proactive-guard.ts",
      "components/settings/account-numo-background-section.tsx",
      "lib/server/numo/watches.ts",
      "lib/server/numo/watch-clock.ts",
      "components/settings/account-numo-watches-section.tsx",
      "lib/server/numo/home-brief.ts",
      "lib/server/numo/home-brief-prompt.ts",
      "app/api/home/brief/route.ts",
      "components/home/home-numo-brief.tsx",
      "lib/server/numo/home-brief-opening.ts",
      "lib/server/isolated-items.ts",
      "lib/server/assistant/commands.ts"
    ]
  },
  "review": {
    "revision": 33,
    "fact": "agent:claude-code (MIN-912: desktop OAuth sentence checked against lib/mcp-authorization.ts and app/api/account/mcp-connections/oauth/callback/route.ts; rest of the article unchanged since the previous review; no figure recaptured, no figure shows this flow); agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 3 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-914: Numo messages in Inbox, their link targets, recipient rule and Messages from Numo switch, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-915: Numo's memory section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-927: Numo's journal section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-929: Numo in the background section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-923: Numo's reminders section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (Numo in the background now on by default: first sentence of #background, checked against lib/numo-background.ts and migration 20270109200112); agent:claude-code (MIN-930: Home summary section, MIN-932 slash command paragraph, MIN-933 opening message, reminders sentence, journal, background and suggestion-row sentences, source audit against the change; no browser walkthrough yet; no figure shows this flow; existing figures kept, not recaptured)",
    "language": "agent:claude-code (fr changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-914 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-915 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-927 passage with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-929 passage translated from en with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-923 passage with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-930 passage translated from en with catalog UI labels and the locale register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-08"
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
      "revision": 33,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 33,
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
      "revision": 33,
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
      "revision": 33,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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
      "revision": 33,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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

1. Vérifiez le contexte affiché dans la zone de saisie. Nommez le ticket si plusieurs éléments sont concernés. Pour ajouter un ticket au contexte, tapez `@` dans la zone de saisie ou utilisez **Ajouter du contexte**, qui range le contexte dans les mêmes sections que le menu `@`, les tickets sous **Tickets** et vos serveurs MCP connectés sous **Serveurs MCP** ; une description liste aussi des tickets trouvés [par le sens](/docs/navigation#search-by-meaning) sous **Liés par le sens**.
2. Choisissez le fournisseur, le modèle et le niveau de raisonnement de la conversation avec le logo du fournisseur, à côté du micro ; le survoler affiche le modèle actuel. Lorsque le modèle n’offre aucun réglage du raisonnement, le curseur reste sur **Sans raisonnement** ; sur un modèle qui raisonne toujours, **Sans raisonnement** utilise son niveau le plus léger.
3. Envoyez une demande délimitée, par exemple : « Lis ce ticket et propose des critères d’acceptation. Ne change pas son statut. »
4. Lisez la réponse et suivez les liens vers les tickets ou les sources. Pour une modification, ouvrez l’objet concerné et contrôlez le résultat. Les tickets, objectifs, projets, pages et membres que Numo a trouvés apparaissent dans sa réponse sous forme de pastilles de mention : une pastille ouvre sa cible, et celle que vous ne pouvez pas voir s’affiche **Indisponible**. Numo écrit aussi ces mentions dans ce qu’il rédige, comme les descriptions et plans des tickets, les descriptions d’objectifs, les commentaires, les pages et le carnet, uniquement pour les éléments qu’il a identifiés ; un membre mentionné ainsi est notifié comme pour toute mention.

Dans une nouvelle conversation vide, quatre lignes de suggestions au-dessus du champ de saisie proposent des demandes adaptées à la page actuelle, par exemple **Résumer ce ticket** ou **Écrire un plan d’implémentation** lorsqu’un ticket est ouvert dans le panneau latéral. Choisir une ligne remplit le champ de saisie sans l’envoyer : vous pouvez d’abord modifier la demande. Les lignes disparaissent dès que le champ contient du texte et reviennent quand vous le videz. Elles apparaissent dans la mise en page de bureau, pas sur un téléphone. Le champ de saisie en bas de l’**Accueil** affiche les mêmes lignes, avec des suggestions comme **Choisir ma priorité du jour** ou **Trouver ce qui est en retard**. L’**Accueil** est lui-même une conversation avec Numo, identique au panneau sans son en-tête : chaque visite en ouvre une nouvelle, sauf si une réponse est encore en cours, et vous pouvez la poursuivre dans le panneau ; la précédente reste dans l’historique, et le bouton **Nouvelle conversation** en haut à droite en commence une autre. Une fois que Numo a écrit son mot, les lignes de l’**Accueil** sont les suggestions écrites avec lui ([le mot de Numo sur l’Accueil](#home-word)).

Tapez `/` dans le champ de saisie pour choisir une tâche toute prête. **créer ticket** réunit le contexte, puis crée le ticket. **éléments isolés** cherche ce qui est passé entre les mailles : les tickets ouverts auxquels personne n'a touché depuis 30 jours (90 dans le backlog), et les pages qui décrivent du travail à faire mais qu'aucun ticket ne cite et qui n'en citent aucun. Numo répond par une courte liste, chaque élément avec son lien et la raison pour laquelle il est isolé, et propose de créer les tickets manquants ou de planifier ou fermer les tickets oubliés. Il ne signale pas de ticket oublié dans un projet de moins de 10 tickets ouverts, où un ticket isolé saute aux yeux.

Sur l’**Accueil**, et dans le panneau Numo lorsqu’il est agrandi ou a le focus, vous pouvez commencer à écrire sans cliquer dans le champ de saisie : une rafale rapide de touches tapée hors d’un champ de texte s’inscrit dans le champ de saisie, qui prend le focus. Une touche seule lance toujours son raccourci clavier, par exemple C pour créer un ticket, environ 0,2 seconde plus tard sur ces écrans. G suivi d’une touche reste une séquence de navigation ; une troisième touche dans la rafale en fait du texte.

Pour interroger Numo sur un passage, sélectionnez-le dans un éditeur, par exemple une page ou la description d’un ticket, puis choisissez **Demander à Numo** dans la barre d’outils de sélection, sur ordinateur. Le panneau s’ouvre sans rien envoyer : à côté de la page ou du ticket d’où il vient, le passage apparaît comme une pastille de contexte qui affiche ses premiers mots, et le survol de la pastille affiche le passage entier. Saisissez votre question, par exemple « Reformule ce passage plus brièvement » ou « Crée des tickets à partir de ce passage », puis envoyez-la. Le passage accompagne ce seul message. Pour ne pas l’envoyer, retirez sa pastille avec sa croix.

Numo peut aussi regarder les images d’une description de ticket ou d’objectif, d’un plan, d’un commentaire, d’une page ou de votre carnet lorsque le modèle de la conversation accepte les images. Sans cette capacité, Numo indique qu’il n’a pas pu voir l’image au lieu de la décrire.

Numo peut aussi rédiger un fichier à télécharger : un rapport ou un document en PDF, un export en CSV, ou un fichier texte, Markdown, HTML, JSON, XML, SVG ou calendrier. Demandez-le dans votre requête ; Numo peut le construire à partir des fichiers ajoutés à la conversation. Le fichier apparaît dans une carte sous sa réponse : un clic sur la carte ouvre son aperçu quand le format le permet, **Télécharger** l’enregistre, et le menu voisin propose **Aperçu** et **Copier le contenu**. Le fichier reste dans le stockage privé de votre conversation ; pour le partager avec le projet, demandez à Numo de le joindre à un ticket, à un objectif ou à un commentaire qu’il y publie. Un PDF utilise les polices standard : les caractères hors des alphabets d’Europe de l’Ouest et les emoji n’y figurent pas.

Un texte de plus de 12 000 caractères que vous collez dans la zone de saisie, des logs par exemple, rejoint votre message sous forme de pièce jointe **Texte copié** au lieu de remplir la zone de saisie. Numo lit ce fichier en entier avant de s’appuyer dessus : un CSV construit à partir de vos logs couvre donc chaque ligne. Un long message qui parvient à Numo par un autre chemin est joint de la même façon : le message garde ses premières lignes et nomme le fichier.

Quand vous demandez un suivi, ou une liste d’éléments qui partagent des champs, par exemple des candidatures avec leur entreprise, leur statut et leur date, Numo crée une [base de données](/docs/databases) avec ces colonnes et ses premières entrées plutôt qu’une page.

Le modèle par défaut de Numo vient de **Paramètres du compte → IA et Numo → Modèle par défaut de Numo** : le réglage de l’app ou un modèle personnel pour le fournisseur actif. Un choix explicite dans la conversation est prioritaire. Consultez [les paramètres IA et l’usage](/docs/ai-settings-and-usage#ai-keys-and-models).

![Conversation de démonstration Numo avec contexte, demande de changement de priorité et réponse enregistrée.](/documentation/fr/work-with-numo-workflow.png)

### Continuer une conversation {#continue}

La liste des conversations permet de retrouver les échanges précédents. Continuez la conversation qui contient les décisions utiles. Numo organise et suit le travail : il lit et met à jour les tickets, les plans, les pages et les autres contenus minddy, et peut lire les pull requests liées. À votre demande, il peut aussi commenter une pull request, résoudre les conversations de revue déjà traitées et la fusionner. Quand Numo cherche des tickets, les correspondances textuelles et les identifiants exacts passent en premier ; une recherche descriptive peut ajouter des tickets du même projet trouvés par le sens, que Numo doit vérifier avant de s’y fier. Il n’écrit pas de code et ne pousse pas de commits. Pour faire écrire du code, copiez le prompt du ticket pour votre propre agent de code ; consultez [Travail de code et pull requests](/docs/code-work#external-coding-agents).

Si Numo demande une précision, envoyez votre choix avant d’attendre la suite des actions qui en dépendent. Une carte de consommation ou d’erreur explique l’arrêt. Vérifiez toute écriture externe avant de demander de la répéter.

## Comprendre les permissions de Numo {#numo-permissions-and-approvals}

Numo agit dans les limites des droits et du rôle de l’utilisateur courant. Une demande dans le chat ne donne pas à un membre accès aux réglages réservés au propriétaire. Le Numo d’un lecteur, dans le chat ou via `@Numo` dans un commentaire qu’il a le droit de publier, n’utilise que des outils de lecture et sa consommation est imputée au lecteur. Celui-ci gère les membres, les intégrations, le dépôt et les réglages du tableau de retours. Les réglages personnels appartiennent au compte courant.

Numo peut modifier les préférences prises en charge et les réglages de projet autorisés au propriétaire. Vous configurez vous-même les clés des fournisseurs, les connexions Git, le second facteur et les fichiers d’avatar.

### Autoriser l’action {#authorization}

Précisez la modification et son périmètre. Lire une demande n’autorise pas une réponse publique : Numo répond publiquement aux retours uniquement sur demande explicite. Des instructions ou résultats d’un serveur MCP distant ne peuvent pas autoriser d’autres actions. Connectez seulement un service auquel vous faites confiance pour les informations et actions transmises.

Une requête peut atteindre un fournisseur externe. Désactiver sa connexion bloque les nouveaux appels, sans annuler ceux déjà envoyés. Vérifiez une écriture ayant expiré chez le destinataire avant de réessayer.

### Contexte personnel et planifié {#context}

Une conversation ne peut pas emprunter les connexions MCP d’un autre membre. Les routines utilisent les connexions et le budget IA du propriétaire. Après un transfert de propriété, les routines de l’ancien propriétaire dans le projet sont mises en pause ; le nouveau propriétaire crée les routines qui doivent continuer. Une ancienne occurrence ne peut pas conserver les identifiants du précédent. Numo s’exécute sur le serveur : il ne lit pas les fichiers de votre ordinateur et n’utilise pas vos sessions personnelles.

Numo peut laisser un message dans votre Inbox, avec une alerte push, quand une routine trouve un point qui demande votre attention ou quand vous lui demandez de vous prévenir plus tard. Le message ne va qu’au compte pour lequel Numo travaille : dans une routine, son propriétaire. L’interrupteur Messages de Numo des [préférences de notification](/docs/notifications-and-inbox#notification-preferences) désactive ces messages.

![Matrice des permissions Numo pour les actions du projet, connexions personnelles et routines.](/documentation/fr/numo-permissions-and-approvals-workflow.svg)

### Mémoire de Numo {#memory}

Numo garde de courts souvenirs à votre sujet pour que vous n'ayez pas à vous répéter : une préférence comme « écris mes titres de tickets en anglais », un fait comme « le projet Mobile est en pause jusqu'en janvier », ou une consigne permanente. Il en enregistre un quand vous le lui demandez (« retiens que… ») ou quand vous exprimez une préférence que vous voulez visiblement voir appliquée la prochaine fois, et le signale dans sa réponse. Vos souvenirs s'appliquent ensuite dans chaque conversation.

Un souvenir vaut pour tous vos projets ou pour un seul ; Numo vous demande quand il ne sait pas lequel. Un souvenir de projet sert dans les conversations de ce projet, et quand Numo travaille sur ce projet depuis une autre conversation. Vos souvenirs n'appartiennent qu'à vous : les autres membres ne les voient pas et leur Numo ne s'en sert pas. Les routines et `@Numo` dans un commentaire lisent vos souvenirs sans pouvoir les modifier. Vous pouvez garder jusqu'à 100 souvenirs de 1 000 caractères chacun ; à la limite, Numo vous demande lequel remplacer.

**Paramètres du compte → IA et Numo → Mémoire de Numo** liste chaque souvenir avec le projet auquel il s'applique. **Modifier** change son texte, **Supprimer** le retire et **Tout oublier** les retire tous ; une suppression est irréversible. Vous pouvez aussi demander à Numo d'oublier quelque chose. L'interrupteur à côté du titre de la section désactive la mémoire : Numo ne lit alors ni n'enregistre de souvenirs, et ceux déjà enregistrés sont conservés.

### Journal de Numo {#journal}

Numo tient un journal de ce qui vous attend et de ce qu'il a fait pour vous en votre absence : « la PR #12 attend votre relecture depuis 3 jours », « j'ai fait la recherche web demandée dans MIN-42 ». Il écrit une entrée quand vous lui demandez de garder une trace (« note que j'attends la réponse du client ») et, dans une routine ou un commentaire `@Numo`, quand il modifie votre contenu. Il clôt l'entrée une fois l'affaire réglée. La conversation affiche alors **Noté dans le journal** ou **Entrée du journal clôturée**. Le journal n'appartient qu'à vous, n'envoie aucune notification, et les entrées clôturées sont supprimées dans les 180 jours. L'**Accueil** le résume ([le mot de Numo sur l'Accueil](#home-word)) ; pour voir chaque entrée, demandez-la à Numo dans une conversation, ou demandez-lui d'en clore une.

### Le mot de Numo sur l'Accueil {#home-word}

Quand l'**Accueil** ouvre sa nouvelle conversation, Numo écrit le premier, sous la salutation : quelques phrases qui résument son journal, avec d'abord ce qui vous attend, puis ce qu'il a fait qui touche votre contenu, puis ce qu'il propose de faire seul. Les éléments qu'il cite, comme un ticket ou une page, s'ouvrent en un clic. Quand Numo a produit quelque chose pour vous, comme un résumé de vos projets ou une recherche, le mot en donne l'essentiel et les chiffres au lieu de vous renvoyer vers une conversation. Numo réécrit le mot en arrière-plan après chaque tour qui écrit ou clôt une entrée du journal : il est à jour avant que vous ouvriez l'**Accueil**, et l'ouverture de la page ne fait pas appel à l'IA. Quand une entrée qu'il couvre est réglée entre-temps, l'**Accueil** masque le mot jusqu'à ce que Numo ait écrit le suivant. Afficher le mot marque comme vues les entrées qu'il couvre : un mot suivant laisse de côté ce qui a été réglé et ne reprend que ce qui vous attend encore. Quand rien n'est ouvert ni non vu dans le journal, il n'y a pas de mot.

Dès que vous écrivez, la salutation disparaît et le mot reste en haut de la conversation que vous commencez en dessous sur l'**Accueil**, comme premier message de Numo ; sans mot, la conversation commence par votre message. Il est enregistré comme premier message de Numo dans cette conversation : Numo le lit pour vous répondre, comme la suite de ce qu'il a dit, et le panneau et l'historique l'affichent aussi. Au-dessus du champ de saisie, jusqu'à quatre suggestions écrites avec le mot remplacent les lignes habituelles, ou aucune quand rien de précis ne convient. Elles servent aussi de réponses rapides, par exemple **Oui, fais-le seul désormais**, et chacune est une demande complète. Choisir une suggestion remplit le champ de saisie sans l'envoyer. Quand Numo en arrière-plan est désactivé, l'**Accueil** s'ouvre sur la salutation et les lignes habituelles, sans mot. Sur une instance sans IA, il n'y a pas de conversation : l'**Accueil** affiche la salutation et les avis de votre compte, comme les invitations en attente ou l'application de bureau.

### Numo en arrière-plan {#background}

**Paramètres du compte → IA et Numo → Numo en arrière-plan** est activé par défaut : Numo travaille pour vous pendant votre absence. Quand un événement de vos projets vous concerne, par exemple un ticket qui vous est assigné, une mention ou une routine en échec, ou correspond à ce qu'un de vos souvenirs lui demande de surveiller, Numo se réveille quelques minutes plus tard et agit avec les mêmes outils et le même modèle qu'en conversation. Avec le souvenir « pour chaque nouveau ticket de MIN qui demande une recherche web, fais-la et mets le résultat en commentaire », il fait la recherche sur chaque nouveau ticket, publie le commentaire et le note dans son journal, où il écrit ce qu'il a fait et ce qui vous attend. L'**Accueil** résume ce qu'il a noté. L'interrupteur nécessite la mémoire de Numo : tant qu'elle est désactivée, Numo en arrière-plan l'est aussi, et il se réactive avec elle.

Dans un projet partagé, Numo ne modifie que ce qui vous revient : les tickets qui vous sont assignés ou que vous avez créés, les objectifs que vous pilotez, les pages que vous avez créées. Y créer du contenu, ou modifier autre chose, demande un souvenir qui le prévoit. Dans tous vos projets, y compris ceux où vous travaillez seul, il ne met rien à la corbeille et n'en restaure rien, n'agit sur aucune pull request, n'appelle aucun outil MCP externe, n'administre pas le projet (paramètres, membres, intégrations), ne modifie pas les paramètres de votre compte et ne répond pas publiquement aux retours, sauf si l'un de vos souvenirs autorise cette action. Le serveur vérifie que le souvenir existe, vous appartient et s'applique au projet concerné par l'action. Numo ne vous envoie un message dans l'Inbox que si un souvenir le demande, ou pour une urgence, et alors deux fois au plus sur 24 heures.

Quand une action demande une autorisation qu'il n'a pas, Numo la demande dans son journal et propose de s'en charger seul la prochaine fois. Pour l'autoriser, dites-le à Numo dans une conversation, par exemple « oui, fais-le toujours » : il enregistre un souvenir et s'en sert à son prochain réveil. Pour le restreindre, donnez-lui un souvenir comme « dans le projet Design, note seulement dans le journal », modifiez ou supprimez le souvenir qui autorisait une action, ou désactivez l'interrupteur : un réveil qui n'a pas encore commencé est alors annulé, et un réveil déjà en cours se termine. Le tri de vos événements, chaque réveil et le mot de Numo sur l'**Accueil** comptent dans votre usage de l'IA, et un administrateur fixe combien de réveils un membre reçoit sur 24 heures, 20 par défaut. Chaque réveil a lieu dans une conversation à part, absente de la liste de vos conversations et supprimée au bout de 30 jours.

### Rappels de Numo {#reminders}

Demandez à Numo, dans une conversation, de penser à quelque chose pour vous plus tard : « quand MIN-42 sera terminé, rappelle-moi de prévenir le client », « quand l'objectif 0.40 sera terminé, crée le ticket de release » ou « rappelle-moi vendredi à 9 h d'envoyer la facture ». Numo crée un rappel sur un ticket (un statut, ou un commentaire d'une autre personne), un objectif (un statut) ou une date, et la conversation affiche **Rappel créé**. Tant que la condition n'est pas remplie, rien ne s'exécute et rien n'est décompté de votre usage de l'IA : minddy la vérifie toutes les cinq minutes.

Une fois la condition remplie, le rappel se déclenche une seule fois. Pour une chose que vous ferez vous-même, vous recevez un message de Numo dans l'Inbox avec votre consigne. Pour une chose que vous avez demandé à Numo de faire, le message indique que Numo s'en occupe, et Numo exécute la consigne dans la conversation où vous avez créé le rappel (dans une nouvelle si celle-ci a été supprimée ou est occupée), avec les outils et les droits que vous avez à ce moment-là ; ce tour compte dans votre usage de l'IA. Personne ne suit ce tour : Numo n'y pose aucune question, ne modifie pas sa mémoire, ne met rien à la corbeille, ne fusionne rien et n'administre rien ; il indique dans sa réponse ce qu'il vous a laissé. Si votre limite d'usage est atteinte, ou si le tour échoue, vous recevez un message et Numo n'agit pas. Si **Messages de Numo** est désactivé, aucun message n'arrive. Quand Numo a modifié quelque chose sur un rappel, un ticket, une page ou un commentaire par exemple, il note ce qu'il a fait dans son journal, et [le mot de Numo sur l'Accueil](#home-word) vous en parle. Un rappel qui vous envoie seulement un message n'y figure pas.

Un rappel dont la condition n'est jamais remplie expire après 90 jours, et vous pouvez en garder 20 à la fois. Tant que son ticket ou son objectif est dans la corbeille, un rappel attend ; il est annulé quand l'élément est supprimé définitivement ou quand vous perdez l'accès à son projet.

Un rappel n'est pas une routine : il se déclenche une fois, pour un ticket, un objectif ou une date, et vous seul le créez, dans une conversation avec Numo ; une routine s'exécute à chaque planification ou événement jusqu'à ce que vous la mettiez en pause. Les routines, les mentions `@Numo` et Numo en arrière-plan ne peuvent ni créer ni annuler de rappel. **Paramètres du compte → IA et Numo → Rappels** liste vos rappels en cours, et **Annuler le rappel** en retire un. Pour modifier un rappel, demandez-le à Numo.

## Comprendre les tours durables de Numo {#numo-execution-model}

Les messages interactifs, actions contextuelles et routines entrent dans les conversations Numo. Le modèle et le raisonnement de conversation se choisissent dans le composeur. Numo agit avec ses outils minddy et les connexions MCP personnelles que vous avez ajoutées ; il n’a besoin d’aucun dépôt. Une routine crée une nouvelle conversation avec l’instruction enregistrée et le contexte propriétaire/projet. Aucune session de bureau ne doit rester ouverte.

![Schéma: Persister intention, message et UUID. Prendre le tour, enregistrer outils et résultats. Attendre votre réponse si une précision est requise. Relire les événements ; réconcilier les écritures.](/documentation/fr/numo-execution-model-flow.svg)

### Distinguer exécution et affichage {#state}

Chaque demande est enregistrée comme une exécution durable avec son UUID de requête et son message. L’état passe de `queued` à `running`, puis à `completed` ou `waiting_input` ; `stopping`/`stopped` et `retryable`/`failed` décrivent l’interruption et l’échec. SSE affiche l’activité enregistrée sans piloter l’exécution. À la reconnexion, l’affichage reprend les messages et événements après la dernière séquence reçue. Les événements dupliqués ou anciens ne créent pas de deuxième tâche. Le contexte projet reste distinct de l’accès : une conversation réservée au propriétaire reste privée.

### Traiter les mutations incertaines {#mutations}

Avant une modification, le système enregistre l’opération et son point de reprise. Les résultats terminés sont réutilisés. Une lecture interrompue peut être répétée ; une modification dont le résultat est inconnu passe à l’état `reconciling`, sans répétition automatique. Inspectez la destination avant de répéter une écriture externe. Les connexions et le budget des routines restent soumis aux règles de propriété et de coût ; un autre membre ne peut pas utiliser les identifiants MCP personnels de l’ancien propriétaire.

Arrêter Numo termine son tour. Une action externe déjà envoyée peut encore aboutir. Une conversation qui attendait du travail de code lancé par une version antérieure est arrêtée automatiquement et revient au repos.

## Connecter un service MCP personnel à Numo {#numo-mcp-connections}

Dans les paramètres du compte, ouvrez **IA et Numo** et utilisez la carte **MCP pour Numo**. Les liens vers l’ancien onglet MCP pour Numo y mènent. Choisissez un service du catalogue ou ajoutez un serveur MCP HTTPS public. Le catalogue et la recherche du registre ne contournent pas l’inscription ou l’approbation du fournisseur. Numo peut préparer une connexion dans une conversation interactive ; une routine autonome ne peut pas en créer.

La connexion se fait dans un assistant en plusieurs étapes. Un serveur personnalisé ou issu du registre demande d’abord son nom et son adresse HTTPS ; un service du catalogue s’ouvre directement sur l’étape de connexion. Un service du catalogue, une connexion enregistrée ou une entrée du registre qui déclare un jeton connaît déjà sa méthode de connexion : l’étape l’affiche, et **Utiliser une autre méthode** permet d’en changer. Sinon, choisissez **Se connecter avec OAuth**, **Jeton Bearer** ou **Sans authentification**. Les **Paramètres avancés** contiennent le transport (Streamable HTTP par défaut, SSE historique pris en charge) et les en-têtes chiffrés. Placez les secrets dans les identifiants ou en-têtes, jamais l’URL. Les commandes locales et réseaux privés sont exclus. Pour une application OAuth existante, enregistrez l’URL de rappel affichée et saisissez son identifiant et secret. Après l’enregistrement, la dernière étape attend la connexion, puis teste le serveur et indique combien d’outils Numo a trouvés. Sur desktop, seule la page de connexion du fournisseur s’ouvre dans le navigateur système : inutile d’y être connecté à minddy, l’application finalise la connexion à votre retour.

![Réglages MCP personnels, liste vide et commande Ajouter un autre serveur MCP.](/documentation/fr/numo-mcp-connections-workflow.png)

### Tester, reconnecter et supprimer {#manage}

Le menu permet test, modification, reconnexion, désactivation et suppression. Une alerte orange d’authentification nécessite une reconnexion. Les champs secrets vides conservent les valeurs ; changer l’URL efface identifiants et en-têtes. Le contrôle dédié supprime le jeton bearer ; `{}` efface les en-têtes.

La désactivation bloque les nouveaux appels, pas ceux envoyés. Les limites sont 30 secondes, 1 MiB de transport et 64 KB de résultat. Vérifiez les écritures expirées chez le destinataire avant de réessayer. Les routines utilisent les connexions du propriétaire, sans prêt aux autres membres.

![Assistant de connexion à Notion affichant la méthode de connexion connue du catalogue.](/documentation/fr/numo-mcp-connections-config-workflow.png)

## Reprendre un travail Numo arrêté ou en attente {#recover-numo-work}

Revenez à la conversation et lisez ses derniers messages et ses cartes. Distinguez une question en attente, une limite du compte, un plafond de routine et une erreur technique. Fermer le panneau ne prouve pas que le travail s’est arrêté.

Dans une carte de questions active, répondez à toutes les questions requises puis envoyez l’ensemble. Les anciennes cartes sont des traces, sans nouvel envoi possible. Passer une question ne fournit pas l’information manquante et n’autorise pas les modifications qui en dépendent.

### Budget et erreurs {#recovery}

La carte de limite du compte affiche la date de réinitialisation lorsqu’elle est connue et peut proposer un forfait ou une clé personnelle. Celle d’une routine mène à sa gestion : vérifiez le plafond par exécution. Plusieurs conversations peuvent tourner en même temps ; elles partagent le budget du compte. Répéter la demande ne supprime pas la limite.

Une exécution échouée reprend depuis un point sauvegardé seulement s’il subsiste. Vérifiez tickets, pages et services externes avant de relancer : une écriture peut avoir réussi malgré une réponse perdue. Précisez le travail restant et demandez de continuer. Sans point récupérable, transmettez l’état vérifié dans une nouvelle demande. Pour signaler une erreur persistante, indiquez la conversation concernée sans identifiants secrets.

## Choisir un objectif pour un retour {#feedback-objectives}

Les objectifs des retours nécessitent un choix explicite. Demandez à Numo de lier une demande à un objectif nommé du projet, ou de retirer ce lien ; Numo résout le retour et l’objectif avant la modification. Une revue ou une catégorisation générale n’autorise pas l’affectation d’un objectif. Une intégration peut fournir un objectif choisi par le propriétaire. La conversion reprend l’objectif et les catégories du retour ; elle laisse l’objectif vide si aucun n’a été choisi.
