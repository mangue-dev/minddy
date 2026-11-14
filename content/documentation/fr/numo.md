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
  "revision": 41,
  "sourceRevision": 41,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-14",
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
      "lib/server/numo/watches.ts",
      "lib/server/numo/watch-clock.ts",
      "components/settings/account-numo-watches-section.tsx",
      "lib/server/numo/home-brief.ts",
      "lib/server/numo/home-brief-prompt.ts",
      "app/api/home/brief/route.ts",
      "components/home/home-numo-brief.tsx",
      "lib/server/numo/home-brief-opening.ts",
      "lib/numo-watches.ts",
      "lib/server/numo/watch-proposal.ts",
      "components/assistant/watch-proposal-card.tsx",
      "lib/server/numo/watch-prompt.ts",
      "lib/server/assistant/context-compaction.ts",
      "lib/server/assistant/conversation-config.ts",
      "components/assistant/conversation-settings.tsx",
      "components/settings/account-numo-section.tsx",
      "components/assistant/numo-intro.tsx",
      "lib/numo-cited-mentions.ts",
      "lib/server/numo/project-instructions-prompt.ts"
    ]
  },
  "review": {
    "revision": 41,
    "fact": "agent:claude-code (MIN-988: new section #project-instructions, source audit against lib/server/numo/project-instructions-prompt.ts, lib/server/numo/memory-prompt.ts, lib/server/assistant/tools.ts and lib/server/update-project.ts; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-982: personal reminders paragraph of #reminders and the notification-only sentence of #recurring-reminders, source audit against lib/server/numo/watches.ts, watch-clock.ts, watch-prompt.ts, lib/server/numo-notes.ts, lib/server/assistant/execute-tool.ts and messages/*.json; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-969: the composer's `@` menu listing what Numo mentioned in the conversation or in its Home summary under Mentioned by Numo, newest first and at most eight, and offering every non-hidden project's pages with the open project's first, checked against lib/numo-cited-mentions.ts, lib/numo-cited-mentions.test.ts, components/assistant/assistant-shell.tsx, app/(app)/home/page.tsx, lib/use-numo-mentionables.ts and lib/use-numo-mentionables.test.tsx; rest of the article unchanged since the previous review; no figure recaptured, no figure shows the `@` menu); agent:claude-code (MIN-912: desktop OAuth sentence checked against lib/mcp-authorization.ts and app/api/account/mcp-connections/oauth/callback/route.ts; rest of the article unchanged since the previous review; no figure recaptured, no figure shows this flow); agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 3 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-914: Numo messages in Inbox, their link targets, recipient rule and Messages from Numo switch, source audit against the change; no browser walkthrough; existing figures checked against the change and kept, not recaptured); agent:claude-code (MIN-915: Numo's memory section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-927: Numo's journal section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-929: Numo in the background section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-923: Numo's reminders section, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (Numo in the background now on by default: first sentence of #background, checked against lib/numo-background.ts and migration 20270109200112); agent:claude-code (MIN-930: Home summary section, MIN-933 opening message, reminders sentence, journal, background and suggestion-row sentences, source audit against the change; no browser walkthrough yet; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-946: AI budget warning sentence of #home-word, source audit against the change; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-953: recurring reminders section and the last paragraph of #reminders, source audit against lib/numo-watches.ts, lib/server/numo/watches.ts, watch-clock.ts, watch-proposal.ts, lib/server/assistant/proactive-guard.ts and messages/*.json; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-954: step 2 of #work-with-numo, the default-model paragraph, the compaction paragraph of #continue and the model sentence of #numo-execution-model, source audit against lib/server/assistant/conversation-config.ts, lib/server/assistant/context-compaction.ts, components/assistant/conversation-settings.tsx and messages/*.json; no browser walkthrough; no figure shows the model control or the compaction step; existing figures kept, not recaptured); agent:claude-code (MIN-954 settings split: account settings paths moved from the former AI & Numo tab to the Numo, AI and MCP tabs, checked against components/settings/account-settings-page.tsx, components/settings/account-numo-section.tsx and messages/*.json; no browser walkthrough; existing figures kept, not recaptured); agent:claude-code (MIN-955: the paragraph on what Numo can change in #numo-permissions-and-approvals, source audit against lib/server/assistant/settings-coverage.ts, lib/server/account-settings.ts and the update_member_role tool; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-956: search in earlier conversations paragraph and memory switch sentence of #memory, source audit against lib/server/numo/conversation-search.ts, lib/server/numo/turns.ts, lib/server/assistant/execute-tool.ts and messages/*.json; no browser walkthrough; no figure shows this flow; existing figures kept, not recaptured); agent:claude-code (MIN-907 Numo introduction: the message shown on Home and in an empty Numo panel when there is no summary, checked against components/assistant/numo-intro.tsx, app/(app)/home/page.tsx, components/assistant-panel.tsx, components/assistant/assistant-shell.tsx and messages/*.json; no browser walkthrough; no figure shows Home without a summary; existing figures kept, not recaptured)",
    "language": "agent:claude-code (fr changed passages written from the code and catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-14"
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
      "revision": 41,
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
      "revision": 41,
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
      "revision": 41,
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
      "revision": 41,
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
      "revision": 41,
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
2. Sur minddy Cloud, Numo utilise le modèle et le niveau de raisonnement choisis par l’administrateur de votre instance, comme Smart Fill et Smart Assign, et le composeur n’affiche aucun réglage de modèle. Avec une clé personnelle pour Numo, le logo du fournisseur, à côté du micro, choisit le fournisseur, le modèle et le niveau de raisonnement de la conversation ; le survoler affiche le modèle actuel. Lorsque le modèle n’offre aucun réglage du raisonnement, le curseur reste sur **Sans raisonnement** ; sur un modèle qui raisonne toujours, **Sans raisonnement** utilise son niveau le plus léger. Le même logo ramène la conversation sur **minddy Cloud**.
3. Envoyez une demande délimitée, par exemple : « Lis ce ticket et propose des critères d’acceptation. Ne change pas son statut. »
4. Lisez la réponse et suivez les liens vers les tickets ou les sources. Pour une modification, ouvrez l’objet concerné et contrôlez le résultat. Les tickets, objectifs, projets, pages et membres que Numo a trouvés apparaissent dans sa réponse sous forme de pastilles de mention : une pastille ouvre sa cible, et celle que vous ne pouvez pas voir s’affiche **Indisponible**. Numo écrit aussi ces mentions dans ce qu’il rédige, comme les descriptions et plans des tickets, les descriptions d’objectifs, les commentaires, les pages et le carnet, uniquement pour les éléments qu’il a identifiés ; un membre mentionné ainsi est notifié comme pour toute mention. Quand vous tapez `@` dans la zone de saisie, ce que Numo a mentionné dans cette conversation ou dans son [mot sur l’**Accueil**](#home-word) apparaît en premier sous **Mentionné par Numo**, en commençant par son dernier message, dans la limite de huit éléments. Le menu propose aussi les pages de tous vos projets, sauf les projets masqués : dans un projet, ses propres pages viennent d’abord, et les autres indiquent le nom de leur projet.

Dans une nouvelle conversation vide, quatre lignes de suggestions au-dessus du champ de saisie proposent des demandes adaptées à la page actuelle, par exemple **Résumer ce ticket** ou **Écrire un plan d’implémentation** lorsqu’un ticket est ouvert dans le panneau latéral. Choisir une ligne remplit le champ de saisie sans l’envoyer : vous pouvez d’abord modifier la demande. Les lignes disparaissent dès que le champ contient du texte et reviennent quand vous le videz. Elles apparaissent dans la mise en page de bureau, pas sur un téléphone. Le champ de saisie en bas de l’**Accueil** affiche les mêmes lignes, avec des suggestions comme **Choisir ma priorité du jour** ou **Trouver ce qui est en retard**. L’**Accueil** est lui-même une conversation avec Numo, identique au panneau sans son en-tête : chaque visite en ouvre une nouvelle, sauf si une réponse est encore en cours, et elle reste distincte de celle ouverte dans le panneau ; la précédente reste dans l’historique, et le bouton **Nouvelle conversation** en haut à droite en commence une autre. Une fois que Numo a écrit son mot, les lignes de l’**Accueil** sont les suggestions écrites avec lui ([le mot de Numo sur l’Accueil](#home-word)).

Sur l’**Accueil**, et dans le panneau Numo lorsqu’il est agrandi ou a le focus, vous pouvez commencer à écrire sans cliquer dans le champ de saisie : une rafale rapide de touches tapée hors d’un champ de texte s’inscrit dans le champ de saisie, qui prend le focus. Une touche seule lance toujours son raccourci clavier, par exemple C pour créer un ticket, environ 0,2 seconde plus tard sur ces écrans. G suivi d’une touche reste une séquence de navigation ; une troisième touche dans la rafale en fait du texte.

Pour interroger Numo sur un passage, sélectionnez-le dans un éditeur, par exemple une page ou la description d’un ticket, puis choisissez **Demander à Numo** dans la barre d’outils de sélection, sur ordinateur. Le panneau s’ouvre sans rien envoyer : à côté de la page ou du ticket d’où il vient, le passage apparaît comme une pastille de contexte qui affiche ses premiers mots, et le survol de la pastille affiche le passage entier. Saisissez votre question, par exemple « Reformule ce passage plus brièvement » ou « Crée des tickets à partir de ce passage », puis envoyez-la. Le passage accompagne ce seul message. Pour ne pas l’envoyer, retirez sa pastille avec sa croix.

Numo peut aussi regarder les images d’une description de ticket ou d’objectif, d’un plan, d’un commentaire, d’une page ou de votre carnet lorsque le modèle de la conversation accepte les images. Sans cette capacité, Numo indique qu’il n’a pas pu voir l’image au lieu de la décrire.

Numo peut aussi rédiger un fichier à télécharger : un rapport ou un document en PDF, un export en CSV, ou un fichier texte, Markdown, HTML, JSON, XML, SVG ou calendrier. Demandez-le dans votre requête ; Numo peut le construire à partir des fichiers ajoutés à la conversation. Le fichier apparaît dans une carte sous sa réponse : un clic sur la carte ouvre son aperçu quand le format le permet, **Télécharger** l’enregistre, et le menu voisin propose **Aperçu** et **Copier le contenu**. Le fichier reste dans le stockage privé de votre conversation ; pour le partager avec le projet, demandez à Numo de le joindre à un ticket, à un objectif ou à un commentaire qu’il y publie. Un PDF utilise les polices standard : les caractères hors des alphabets d’Europe de l’Ouest et les emoji n’y figurent pas.

Un texte de plus de 12 000 caractères que vous collez dans la zone de saisie, des logs par exemple, rejoint votre message sous forme de pièce jointe **Texte copié** au lieu de remplir la zone de saisie. Numo lit ce fichier en entier avant de s’appuyer dessus : un CSV construit à partir de vos logs couvre donc chaque ligne. Un long message qui parvient à Numo par un autre chemin est joint de la même façon : le message garde ses premières lignes et nomme le fichier.

Quand vous demandez un suivi, ou une liste d’éléments qui partagent des champs, par exemple des candidatures avec leur entreprise, leur statut et leur date, Numo crée une [base de données](/docs/databases) avec ces colonnes et ses premières entrées plutôt qu’une page.

Avec une clé personnelle, le modèle par défaut de Numo vient de **Paramètres du compte → IA → Numo → Conversations**, enregistré pour ce fournisseur : le réglage de l’app ou un modèle de votre choix. Le choix propre à une conversation est prioritaire. Sur minddy Cloud, il n’y a pas de modèle à choisir. Consultez [les paramètres IA et l’usage](/docs/ai-settings-and-usage#ai-keys-and-models).

![Conversation de démonstration Numo avec contexte, demande de changement de priorité et réponse enregistrée.](/documentation/fr/work-with-numo-workflow.png)

### Continuer une conversation {#continue}

La liste des conversations permet de retrouver les échanges précédents. Continuez la conversation qui contient les décisions utiles. Numo organise et suit le travail : il lit et met à jour les tickets, les plans, les pages et les autres contenus minddy, et peut lire les pull requests liées. À votre demande, il peut aussi commenter une pull request, résoudre les conversations de revue déjà traitées et la fusionner. Quand Numo cherche des tickets, les correspondances textuelles et les identifiants exacts passent en premier ; une recherche descriptive peut ajouter des tickets du même projet trouvés par le sens, que Numo doit vérifier avant de s’y fier. Il n’écrit pas de code et ne pousse pas de commits. Pour faire écrire du code, copiez le prompt du ticket pour votre propre agent de code ; consultez [Travail de code et pull requests](/docs/code-work#external-coding-agents).

Quand une conversation devient trop longue pour être renvoyée à moindre coût, environ 90 000 tokens ou les trois quarts de ce que le modèle peut lire si c’est moins, Numo la compacte avant son appel suivant : la réponse affiche **Compaction du contexte…**, puis **Contexte compacté**. Numo résume les anciens messages et résultats d’outils, et garde mot pour mot votre dernier message et les derniers échanges ; les réponses suivantes repartent de ce résumé. Le résumé compte dans l’usage IA comme le reste de la réponse. S’il échoue, l’étape indique **Impossible de compacter le contexte** et Numo répond à partir de toute la conversation.

Si Numo demande une précision, envoyez votre choix avant d’attendre la suite des actions qui en dépendent. Une carte de consommation ou d’erreur explique l’arrêt. Vérifiez toute écriture externe avant de demander de la répéter.

## Comprendre les permissions de Numo {#numo-permissions-and-approvals}

Numo agit dans les limites des droits et du rôle de l’utilisateur courant. Une demande dans le chat ne donne pas à un membre accès aux réglages réservés au propriétaire. Le Numo d’un lecteur, dans le chat ou via `@Numo` dans un commentaire qu’il a le droit de publier, n’utilise que des outils de lecture et sa consommation est imputée au lecteur. Celui-ci gère les membres, les intégrations, le dépôt et les réglages du tableau de retours. Les réglages personnels appartiennent au compte courant.

Numo peut modifier vos préférences de compte, masquer ou réafficher des projets pour vous et, si vous êtes propriétaire d’un projet, ses réglages, ses membres et leurs rôles. Certains gestes restent les vôtres : les clés des fournisseurs et les modèles d’IA, les connexions Git, la connexion, le second facteur et les applications connectées, l’avatar et l’icône du projet, le transfert de propriété, l’export des données et la suppression du compte.

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

Numo peut aussi chercher dans vos conversations passées avec lui. Quand vous faites référence à quelque chose de déjà dit qui n'est ni dans la conversation en cours ni dans vos souvenirs (« comme on l'a décidé la semaine dernière », « retrouve la conversation sur les tarifs »), il cherche dans ce que vous avez écrit et ce qu'il a répondu, lit la conversation qui correspond et vous dit de laquelle il parle. Il ne cherche que dans vos propres conversations, archivées comprises : les 100 plus récemment actives, ou celles d'une période que vous indiquez. Ce que ses outils ont renvoyé n'est pas cherché. Les routines, `@Numo` dans un commentaire et Numo en arrière-plan ne cherchent pas dans vos conversations, et leurs propres conversations ne sont pas cherchées.

**Paramètres du compte → Numo → Souvenirs** liste chaque souvenir avec le projet auquel il s'applique. **Modifier** change son texte, **Supprimer** le retire et **Tout oublier** les retire tous ; une suppression est irréversible. Vous pouvez aussi demander à Numo d'oublier quelque chose. **Mémoire de Numo**, dans la carte **Numo** au-dessus, désactive la mémoire : Numo ne lit alors ni n'enregistre de souvenirs et ne cherche pas dans vos conversations passées ; les souvenirs déjà enregistrés sont conservés.

### Consignes pour Smart Fill et Smart Assign {#project-instructions}

Lorsque vous dites à Numo comment Smart Fill ou Smart Assign doit travailler, par exemple « Smart Fill écrit toujours les titres en anglais » ou « les bugs de paiement sont au moins en priorité haute », Numo n’enregistre pas de souvenir. Un souvenir n’appartient qu’à vous, alors que ces automatisations agissent pour tout le projet, quel que soit l’auteur du ticket. Si vous êtes propriétaire du projet, Numo règle la langue de travail ou écrit la consigne dans les [**Consignes de l'IA**](/docs/projects#ai-instructions) du projet, vous dit ce qu’il a ajouté et que cela vaut pour tous les membres. Sinon, Numo vous indique que c’est le propriétaire qui les règle.

### Journal de Numo {#journal}

Numo tient un journal de ce qui vous attend et de ce qu'il a fait pour vous en votre absence : « la PR #12 attend votre relecture depuis 3 jours », « j'ai fait la recherche web demandée dans MIN-42 ». Il écrit une entrée quand vous lui demandez de garder une trace (« note que j'attends la réponse du client ») et, dans une routine ou un commentaire `@Numo`, quand il modifie votre contenu. Il clôt l'entrée une fois l'affaire réglée. La conversation affiche alors **Noté dans le journal** ou **Entrée du journal clôturée**. Le journal n'appartient qu'à vous, n'envoie aucune notification, et les entrées clôturées sont supprimées dans les 180 jours. L'**Accueil** le résume ([le mot de Numo sur l'Accueil](#home-word)) ; pour voir chaque entrée, demandez-la à Numo dans une conversation, ou demandez-lui d'en clore une.

### Le mot de Numo sur l'Accueil {#home-word}

Quand l'**Accueil** ouvre sa nouvelle conversation, Numo écrit le premier, sous la salutation : quelques phrases qui résument son journal, avec d'abord ce qui vous attend, puis ce qu'il a fait qui touche votre contenu, puis ce qu'il propose de faire seul. Les éléments qu'il cite, comme un ticket ou une page, s'ouvrent en un clic. Quand Numo a produit quelque chose pour vous, comme un résumé de vos projets ou une recherche, le mot en donne l'essentiel et les chiffres au lieu de vous renvoyer vers une conversation. Numo réécrit le mot en arrière-plan après chaque tour qui écrit ou clôt une entrée du journal : il est à jour avant que vous ouvriez l'**Accueil**, et l'ouverture de la page ne fait pas appel à l'IA. Quand une entrée qu'il couvre est réglée entre-temps, l'**Accueil** masque le mot jusqu'à ce que Numo ait écrit le suivant. Afficher le mot marque comme vues les entrées qu'il couvre : un mot suivant laisse de côté ce qui a été réglé et ne reprend que ce qui vous attend encore. Quand votre budget IA est en voie d'être épuisé avant son renouvellement, le mot commence par là : le jour où il le sera au rythme actuel et la part déjà consommée, en pourcentage. Quand rien n'est ouvert ni non vu dans le journal et que le budget tiendra, il n'y a pas de mot.

Quand il n'y a pas de mot, Numo se présente à sa place sous la salutation : un court message qui vous nomme, cite le premier projet où vous pouvez créer des tickets et dit ce que Numo peut y faire. Sans un tel projet, il dit ce que Numo fera dès que vous en aurez un. Un panneau Numo vide s'ouvre sur la même présentation. minddy l'écrit sans appeler l'IA et ne l'enregistre jamais : elle disparaît quand vous envoyez votre premier message, et le mot la remplace dès que Numo en a écrit un.

Dès que vous écrivez, la salutation et le mot restent en haut de la conversation que vous commencez en dessous sur l'**Accueil**, le mot comme premier message de Numo ; sans mot, la conversation commence par votre message. Il est enregistré comme premier message de Numo dans cette conversation : Numo le lit pour vous répondre, comme la suite de ce qu'il a dit, et le panneau et l'historique l'affichent aussi. Au-dessus du champ de saisie, jusqu'à quatre suggestions écrites avec le mot remplacent les lignes habituelles, ou aucune quand rien de précis ne convient. Elles servent aussi de réponses rapides, par exemple **Oui, fais-le seul désormais**, et chacune est une demande complète. Choisir une suggestion remplit le champ de saisie sans l'envoyer. Quand Numo en arrière-plan est désactivé, l'**Accueil** s'ouvre sur la salutation, la présentation de Numo et les lignes habituelles, sans mot. Sur une instance sans IA, il n'y a pas de conversation : l'**Accueil** affiche la salutation et les avis de votre compte, comme les invitations en attente ou l'application de bureau.

### Numo en arrière-plan {#background}

**Paramètres du compte → Numo → Numo en arrière-plan** est activé par défaut : Numo travaille pour vous pendant votre absence. Quand un événement de vos projets vous concerne, par exemple un ticket qui vous est assigné, une mention ou une routine en échec, ou correspond à ce qu'un de vos souvenirs lui demande de surveiller, Numo se réveille quelques minutes plus tard et agit avec les mêmes outils et le même modèle qu'en conversation. Avec le souvenir « pour chaque nouveau ticket de MIN qui demande une recherche web, fais-la et mets le résultat en commentaire », il fait la recherche sur chaque nouveau ticket, publie le commentaire et le note dans son journal, où il écrit ce qu'il a fait et ce qui vous attend. L'**Accueil** résume ce qu'il a noté. L'interrupteur nécessite la mémoire de Numo : tant qu'elle est désactivée, Numo en arrière-plan l'est aussi, et il se réactive avec elle.

Dans un projet partagé, Numo ne modifie que ce qui vous revient : les tickets qui vous sont assignés ou que vous avez créés, les objectifs que vous pilotez, les pages que vous avez créées. Y créer du contenu, ou modifier autre chose, demande un souvenir qui le prévoit. Dans tous vos projets, y compris ceux où vous travaillez seul, il ne met rien à la corbeille et n'en restaure rien, n'agit sur aucune pull request, n'appelle aucun outil MCP externe, n'administre pas le projet (paramètres, membres, intégrations), ne modifie pas les paramètres de votre compte et ne répond pas publiquement aux retours, sauf si l'un de vos souvenirs autorise cette action. Le serveur vérifie que le souvenir existe, vous appartient et s'applique au projet concerné par l'action. Numo ne vous envoie un message dans l'Inbox que si un souvenir le demande, ou pour une urgence, et alors deux fois au plus sur 24 heures.

Si vous êtes administrateur de l'instance avec l'authentification à deux facteurs activée, Numo en arrière-plan peut aussi [administrer l'instance](/docs/instance-administration#numo). Il lit de lui-même la configuration des modèles IA et les coûts IA : vous pouvez donc lui donner un souvenir comme « surveille les modèles IA configurés sur l'instance et préviens-moi quand un modèle moins cher fait l'affaire ». Modifier ou importer la configuration des modèles, chercher un compte ou changer son plan demande un souvenir qui autorise cette action ; sans lui, Numo pose la question dans son journal et l'**Accueil** la reprend. Votre compte est vérifié avant chacune de ces actions : dès qu'il perd le rôle d'administrateur ou l'authentification à deux facteurs, Numo les perd aussi.

Quand une action demande une autorisation qu'il n'a pas, Numo la demande dans son journal et propose de s'en charger seul la prochaine fois. Pour l'autoriser, dites-le à Numo dans une conversation, par exemple « oui, fais-le toujours » : il enregistre un souvenir et s'en sert à son prochain réveil. Pour le restreindre, donnez-lui un souvenir comme « dans le projet Design, note seulement dans le journal », modifiez ou supprimez le souvenir qui autorisait une action, ou désactivez l'interrupteur : un réveil qui n'a pas encore commencé est alors annulé, et un réveil déjà en cours se termine. Le tri de vos événements, chaque réveil et le mot de Numo sur l'**Accueil** comptent dans votre usage de l'IA, et un administrateur fixe combien de réveils un membre reçoit sur 24 heures, 20 par défaut. Chaque réveil a lieu dans une conversation à part, absente de la liste de vos conversations et supprimée au bout de 30 jours.

### Rappels de Numo {#reminders}

Demandez à Numo, dans une conversation, de penser à quelque chose pour vous plus tard : « quand MIN-42 sera terminé, rappelle-moi de prévenir le client », « quand l'objectif 0.40 sera terminé, crée le ticket de release » ou « rappelle-moi vendredi à 9 h d'envoyer la facture ». Numo crée un rappel sur un ticket (un statut, ou un commentaire d'une autre personne), un objectif (un statut) ou une date, et la conversation affiche **Rappel créé**. Tant que la condition n'est pas remplie, rien ne s'exécute et rien n'est décompté de votre usage de l'IA : minddy la vérifie toutes les cinq minutes.

Une fois la condition remplie, le rappel se déclenche une seule fois. Pour une chose que vous ferez vous-même, vous recevez un message de Numo dans l'Inbox avec votre consigne. Pour une chose que vous avez demandé à Numo de faire, le message indique que Numo s'en occupe, et Numo exécute la consigne dans la conversation où vous avez créé le rappel (dans une nouvelle si celle-ci a été supprimée ou est occupée), avec les outils et les droits que vous avez à ce moment-là ; ce tour compte dans votre usage de l'IA. Personne ne suit ce tour : Numo n'y pose aucune question, ne modifie pas sa mémoire, ne met rien à la corbeille, ne fusionne rien et n'administre rien ; il indique dans sa réponse ce qu'il vous a laissé. Si votre limite d'usage est atteinte, ou si le tour échoue, vous recevez un message et Numo n'agit pas. Si **Messages de Numo** est désactivé, aucun message n'arrive. Quand Numo a modifié quelque chose sur un rappel, un ticket, une page ou un commentaire par exemple, il note ce qu'il a fait dans son journal, et [le mot de Numo sur l'Accueil](#home-word) vous en parle. Un rappel qui vous envoie seulement un message n'y figure pas.

Un rappel dont la condition n'est jamais remplie expire après 90 jours, et vous pouvez en garder 20 à la fois. Tant que son ticket ou son objectif est dans la corbeille, un rappel attend ; il est annulé quand l'élément est supprimé définitivement ou quand vous perdez l'accès à son projet.

Un rappel ponctuel se déclenche une fois, pour un ticket, un objectif ou une date ; pour ce qui revient, créez un [rappel récurrent](#recurring-reminders). Vous seul créez un rappel, dans une conversation avec Numo : les routines, les mentions `@Numo`, Numo en arrière-plan et le passage d'un rappel ne peuvent ni en créer, ni en modifier, ni en annuler. **Paramètres du compte → Numo → Rappels** liste les rappels que vous gardez, et **Annuler le rappel** en retire un. Pour modifier un rappel, demandez-le à Numo.

Un rappel sur une date, ponctuel ou récurrent, n'a pas besoin de projet : « chaque jour à 9 h, cherche sur le web si un concert de X est annoncé » n'en concerne aucun. Numo l'exécute alors sans projet en contexte, et ses messages comme ses entrées de journal ne citent aucun projet. **Paramètres du compte → Numo → Rappels** l'affiche comme **Personnel**. Un rappel sur un ticket ou un objectif appartient toujours au projet de cet élément.

### Rappels récurrents {#recurring-reminders}

Un rappel peut aussi revenir à heure fixe : « tous les soirs à 19 h, fais le point sur mes tickets et prépare ma journée de demain », ou « chaque lundi à 9 h, vérifie les coûts des modèles et préviens-moi si ça dérape ». Numo le règle sur tous les jours, du lundi au vendredi, un jour par semaine ou un jour par mois, à une heure de votre fuseau, qu'il conserve au changement d'heure. Un mois plus court que le jour choisi utilise son dernier jour. Un rappel récurrent n'expire pas, et vous pouvez en garder 5 actifs parmi vos 20.

À chaque passage, Numo exécute la consigne dans une nouvelle conversation, nommée d'après le rappel et le jour, avec les outils et les droits que vous avez à ce moment-là ; ce passage compte dans votre usage de l'IA. Personne ne le suit : Numo n'y pose aucune question, ne modifie pas sa mémoire, et s'en tient aux limites de [Numo en arrière-plan](#background) : dans un projet partagé, il ne modifie que ce qui vous revient, et il ne fait aucune action sensible. Vos souvenirs ne lèvent pas ces limites ici ; seules les autorisations du rappel le font. Numo note son résultat dans son journal, que [le mot de Numo sur l'Accueil](#home-word) vous rapporte. Aucun message n'annonce chaque passage.

Pour qu'un rappel récurrent puisse en faire plus, demandez-le en le créant. Il peut être autorisé à vous notifier sans urgence, à modifier ce qui n'est pas à vous dans un projet partagé, à agir sur les pull requests, à appeler vos outils MCP externes, à répondre publiquement aux retours, à utiliser la corbeille, à retirer des membres, des invitations et des intégrations, à modifier les paramètres de votre compte, ou à administrer vos projets et, pour un administrateur, l'instance. Numo n'enregistre alors rien lui-même : la conversation affiche une carte qui liste ce que le rappel pourra faire, et **Autoriser et créer le rappel** l'enregistre. Un rappel autorisé seulement à vous prévenir n'a pas besoin de carte : Numo l'enregistre aussitôt. Vos droits sont revérifiés à chaque passage : un rappel autorisé à administrer l'instance ne reçoit aucun outil d'administration dès que votre compte n'est plus administrateur, et un rappel est annulé quand vous perdez l'accès à son projet. Numo ne peut ni ajouter une autorisation à un rappel, ni reformuler un rappel qui en détient : il propose un remplacement, que vous confirmez sur une nouvelle carte.

Un passage que minddy a manqué de plus de six heures est sauté. Quand un passage n'aboutit pas, ou que votre limite d'usage est atteinte, vous recevez un message. Après 3 passages de suite qui n'aboutissent pas, le rappel est mis en pause et un message vous le dit. **Paramètres du compte → Numo → Rappels** affiche, pour chaque rappel récurrent, sa cadence, son prochain passage, ce qu'il est autorisé à faire et son dernier passage, avec un lien vers cette conversation. **Mettre le rappel en pause** l'arrête et **Reprendre le rappel** le relance à son prochain passage.

Un rappel récurrent est à vous ; une routine appartient à un projet. Vous seul voyez votre rappel et ses conversations, il s'exécute avec vos droits et sur votre usage de l'IA, et il peut détenir des autorisations. Tous les membres du projet voient une routine et ses exécutions, elle s'exécute sur l'usage et les connexions du propriétaire du projet, elle peut aussi démarrer sur un événement, et elle n'accède jamais à l'administration de l'instance. Utilisez un rappel récurrent pour vos habitudes et une routine pour le travail que l'équipe partage.

## Comprendre les tours durables de Numo {#numo-execution-model}

Les messages interactifs, actions contextuelles et routines entrent dans les conversations Numo. Avec une clé personnelle, le modèle et le raisonnement de la conversation se choisissent dans le composeur ; sur minddy Cloud, ils viennent de l’instance. Numo agit avec ses outils minddy et les connexions MCP personnelles que vous avez ajoutées ; il n’a besoin d’aucun dépôt. Une routine crée une nouvelle conversation avec l’instruction enregistrée et le contexte propriétaire/projet. Aucune session de bureau ne doit rester ouverte.

![Schéma: Persister intention, message et UUID. Prendre le tour, enregistrer outils et résultats. Attendre votre réponse si une précision est requise. Relire les événements ; réconcilier les écritures.](/documentation/fr/numo-execution-model-flow.svg)

### Distinguer exécution et affichage {#state}

Chaque demande est enregistrée comme une exécution durable avec son UUID de requête et son message. L’état passe de `queued` à `running`, puis à `completed` ou `waiting_input` ; `stopping`/`stopped` et `retryable`/`failed` décrivent l’interruption et l’échec. SSE affiche l’activité enregistrée sans piloter l’exécution. À la reconnexion, l’affichage reprend les messages et événements après la dernière séquence reçue. Les événements dupliqués ou anciens ne créent pas de deuxième tâche. Le contexte projet reste distinct de l’accès : une conversation réservée au propriétaire reste privée.

### Traiter les mutations incertaines {#mutations}

Avant une modification, le système enregistre l’opération et son point de reprise. Les résultats terminés sont réutilisés. Une lecture interrompue peut être répétée ; une modification dont le résultat est inconnu passe à l’état `reconciling`, sans répétition automatique. Inspectez la destination avant de répéter une écriture externe. Les connexions et le budget des routines restent soumis aux règles de propriété et de coût ; un autre membre ne peut pas utiliser les identifiants MCP personnels de l’ancien propriétaire.

Arrêter Numo termine son tour. Une action externe déjà envoyée peut encore aboutir. Une conversation qui attendait du travail de code lancé par une version antérieure est arrêtée automatiquement et revient au repos.

## Connecter un service MCP personnel à Numo {#numo-mcp-connections}

Dans les paramètres du compte, ouvrez **MCP** et utilisez la carte **MCP pour Numo**. Les liens vers l’ancien onglet MCP pour Numo y mènent. Choisissez un service du catalogue ou ajoutez un serveur MCP HTTPS public. Le catalogue et la recherche du registre ne contournent pas l’inscription ou l’approbation du fournisseur. Numo peut préparer une connexion dans une conversation interactive ; une routine autonome ne peut pas en créer.

La connexion se fait dans un assistant en plusieurs étapes. Un serveur personnalisé ou issu du registre demande d’abord son nom et son adresse HTTPS ; un service du catalogue s’ouvre directement sur l’étape de connexion. Un service du catalogue, une connexion enregistrée ou une entrée du registre qui déclare un jeton connaît déjà sa méthode de connexion : l’étape l’affiche, et **Utiliser une autre méthode** permet d’en changer. Sinon, choisissez **Se connecter avec OAuth**, **Jeton Bearer** ou **Sans authentification**. Les **Paramètres avancés** contiennent le transport (Streamable HTTP par défaut, SSE historique pris en charge) et les en-têtes chiffrés. Placez les secrets dans les identifiants ou en-têtes, jamais l’URL. Les commandes locales et réseaux privés sont exclus. Pour une application OAuth existante, enregistrez l’URL de rappel affichée et saisissez son identifiant et secret. Après l’enregistrement, la dernière étape attend la connexion, puis teste le serveur et indique combien d’outils Numo a trouvés. Sur desktop, seule la page de connexion du fournisseur s’ouvre dans le navigateur système : inutile d’y être connecté à minddy, l’application finalise la connexion à votre retour.

![Réglages MCP personnels, liste vide et commande Ajouter un autre serveur MCP.](/documentation/fr/numo-mcp-connections-workflow.png)

### Tester, reconnecter et supprimer {#manage}

Le menu permet test, modification, reconnexion, désactivation et suppression. Une alerte orange d’authentification nécessite une reconnexion. Les champs secrets vides conservent les valeurs ; changer l’URL efface identifiants et en-têtes. Le contrôle dédié supprime le jeton bearer ; `{}` efface les en-têtes.

La désactivation bloque les nouveaux appels, pas ceux envoyés. Les limites sont 30 secondes, 1 MiB de transport et 64 KB de résultat. Vérifiez les écritures expirées chez le destinataire avant de réessayer. Les routines utilisent les connexions du propriétaire, sans prêt aux autres membres.

![Assistant de connexion à Notion affichant la méthode de connexion connue du catalogue.](/documentation/fr/numo-mcp-connections-config-workflow.png)

## Reprendre un travail Numo arrêté ou en attente {#recover-numo-work}

Revenez à la conversation et lisez ses derniers messages et ses cartes. Distinguez une question en attente, une limite du compte, un plafond de routine et une erreur technique. Fermer le panneau ne prouve pas que le travail s’est arrêté.

Si la connexion à minddy est coupée avant la réponse de Numo, par exemple quand l’application passe en arrière-plan sur votre téléphone, la conversation affiche une carte de connexion. Dès que vous êtes de retour en ligne ou dans l’application, minddy vérifie si votre message est arrivé. S’il est arrivé, le travail de Numo reprend ou sa réponse s’affiche. Sinon, le message quitte la conversation et **Renvoyer** l’envoie à nouveau. **Réessayer** lance la vérification tout de suite.

Dans une carte de questions active, répondez à toutes les questions requises puis envoyez l’ensemble. Les anciennes cartes sont des traces, sans nouvel envoi possible. Passer une question ne fournit pas l’information manquante et n’autorise pas les modifications qui en dépendent.

### Budget et erreurs {#recovery}

La carte de limite du compte affiche la date de réinitialisation lorsqu’elle est connue et peut proposer un forfait ou une clé personnelle. Celle d’une routine mène à sa gestion : vérifiez le plafond par exécution. Plusieurs conversations peuvent tourner en même temps ; elles partagent le budget du compte. Répéter la demande ne supprime pas la limite.

Une exécution échouée reprend depuis un point sauvegardé seulement s’il subsiste. Vérifiez tickets, pages et services externes avant de relancer : une écriture peut avoir réussi malgré une réponse perdue. Précisez le travail restant et demandez de continuer. Sans point récupérable, transmettez l’état vérifié dans une nouvelle demande. Pour signaler une erreur persistante, indiquez la conversation concernée sans identifiants secrets.

## Choisir un objectif pour un retour {#feedback-objectives}

Les objectifs des retours nécessitent un choix explicite. Demandez à Numo de lier une demande à un objectif nommé du projet, ou de retirer ce lien ; Numo résout le retour et l’objectif avant la modification. Une revue ou une catégorisation générale n’autorise pas l’affectation d’un objectif. Une intégration peut fournir un objectif choisi par le propriétaire. La conversion reprend l’objectif et les catégories du retour ; elle laisse l’objectif vide si aucun n’a été choisi.
