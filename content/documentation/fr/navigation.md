---
{
  "id": "navigation",
  "locale": "fr",
  "title": "Navigation et recherche",
  "summary": "Parcourez votre travail personnel et les projets, utilisez les onglets et les panneaux, et retrouvez les éléments accessibles avec la recherche et les raccourcis clavier.",
  "topic": "Premiers pas",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S04",
    "W15"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 22,
  "sourceRevision": 22,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-29",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/app-sidebar.tsx",
      "components/secondary-sidebar.tsx",
      "content/knowledge/agents-and-mcp.md",
      "content/knowledge/productivity.md",
      "components/command-palette.tsx",
      "components/keyboard-cheatsheet.tsx",
      "components/issue-field-shortcuts.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/keyboard/keyboard-context.tsx",
      "components/project-context-actions.tsx",
      "lib/sidebar-context-actions.ts",
      "components/routines/routines-panel.tsx",
      "components/pull-requests/pr-context-actions.tsx",
      "lib/use-hidden-projects.ts",
      "lib/issue-semantic-query.ts",
      "lib/use-semantic-issue-search.ts",
      "lib/server/issue-semantic-search.ts",
      "app/api/issues/semantic-search/route.ts",
      "lib/use-semantic-mentions.ts",
      "lib/issue-search-order.ts",
      "components/app-tab-strip.tsx",
      "lib/app-tab-indicators.ts",
      "lib/settings-sections.ts",
      "lib/settings-section-focus.ts",
      "components/settings-shell.tsx",
      "components/settings/account-smart-fill-section.tsx",
      "components/objective-relations-section.tsx",
      "components/create-issue-dialog.tsx",
      "components/app-shell-chrome.tsx",
      "components/editor/find-bar.tsx",
      "lib/keyboard/find-shortcut.ts",
      "lib/palette-workspace-groups.ts",
      "components/inbox-content.tsx",
      "lib/inbox-launcher.ts",
      "lib/palette-picker.ts",
      "components/palette-picker-rows.tsx",
      "components/mobile-navigation.tsx",
      "components/mobile-nav-actions.tsx",
      "lib/keyboard/typeahead.ts"
    ]
  },
  "review": {
    "revision": 22,
    "fact": "agent:claude-code (pointer to the Numo type-ahead on Home and in the expanded Numo panel, checked against lib/keyboard/typeahead.ts and lib/keyboard/keyboard-context.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured, existing figures do not show this behavior)",
    "language": "agent:claude-code (fr changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-29"
  },
  "related": [
    "views",
    "applications"
  ],
  "aliases": [
    "productivity",
    "search-and-shortcuts"
  ],
  "tags": [
    "Retrouver votre travail et changer de projet",
    "Retrouver le travail et agir au clavier"
  ],
  "figures": [
    {
      "id": "navigation-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-navigation.png",
      "alt": "Navigation du projet à côté du tableau de tickets de démonstration.",
      "caption": "La barre du projet donne accès aux tickets, objectifs, pages et arrivées en triage.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        1488,
        1128
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-search.png",
      "alt": "Résultats de recherche pour l’identifiant d’un ticket de démonstration.",
      "caption": "La palette retrouve le ticket par identifiant avec les pages du projet ; ouvrir un résultat conserve ses règles d’accès.",
      "revision": 22,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        788,
        320
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "navigation-steps",
    "search-and-shortcuts-steps"
  ]
}
---

La navigation permet de choisir votre travail personnel ou un projet ; la palette de commandes retrouve un ticket ou une action précise. Les panneaux, la navigation mobile et les onglets desktop donnent accès à ce travail selon votre appareil. Vérifiez le projet et l’instance sélectionnés avant une modification.

## Retrouver votre travail et changer de projet {#navigation}

La navigation principale donne accès au travail personnel et aux projets. Sélectionnez un projet pour consulter ses tickets et ses destinations secondaires : triage, objectifs, pages et réglages du projet. La ligne de retour remonte d’un niveau de navigation ; elle peut modifier la barre latérale tout en laissant la page principale ouverte. Choisissez une destination pour y naviguer. Dans une liste comme le triage, les objectifs, les retours, la revue de code ou les routines, le champ de filtre en haut de la barre latérale cherche dans tous les éléments, quels que soient les filtres qui restreignent la liste ; son texte indicatif en donne le total.

Les compteurs et les alertes vous suivent d’un niveau à l’autre. Le contrôle qui ramène à l’**Accueil** affiche le total à trier dans les projets que liste l’**Accueil**, projet courant compris, ainsi que l’alerte Smart Assign quand l’un de vos projets manque de règles. Une ligne de retour affiche le compteur du niveau vers lequel elle remonte en pastille sur sa flèche, en orange tant que l’alerte Smart Assign s’applique. Dans un projet, **Triage** et **Retours** gardent les compteurs propres à ce projet. Les onglets de l’app de bureau portent le même badge que leur entrée de la barre latérale : l’alerte sur l’**Accueil**, et les compteurs sur **Inbox**, **Code review**, ainsi que **Triage** et **Retours** d’un projet, mis à jour même quand l’onglet est en arrière-plan.

Les cycles personnels et les vues transversales couvrent les projets accessibles à votre compte. Les objectifs, les pages et les retours appartiennent à un projet précis. Vérifiez le projet actif avant de créer du travail ou de modifier ses réglages.

![Navigation du projet à côté du tableau de tickets de démonstration.](/documentation/fr/work-navigation.png)

### Agir depuis une ligne de la barre latérale {#sidebar-menus}

Faites un clic droit sur une ligne de la barre latérale pour agir sur ce qu’elle représente sans l’ouvrir d’abord. Les lignes de lien proposent aussi **Ouvrir dans un nouvel onglet** et **Copier le lien**. Une action qui place un élément dans la corbeille vient toujours en dernier, après un séparateur.

- La ligne **Tous les tickets** propose **Nouveau ticket**, et la ligne **Routines** propose **Nouvelle routine** si vous êtes propriétaire d’un projet.
- Une ligne de projet, ou le nom du projet en haut de son panneau, propose **Nouveau** (un ticket, un objectif ou une page dans ce projet) et **Paramètres du projet**. Le propriétaire du projet voit aussi **Déplacer vers la corbeille**, qui demande la même confirmation que les paramètres du projet. Le même menu propose aussi **Masquer le projet**, ou **Réafficher le projet** pour un projet que vous avez masqué ; voir [Masquer un projet pour vous](/docs/projects#hide-project).
- Un onglet de projet propose sa propre création : **Nouveau ticket** sur Tickets, **Nouvel objectif** sur Objectifs, **Nouvelle page** sur Pages et **Nouveau retour** sur Retours, qui ouvre le formulaire de retour interne.
- Une ligne de routine propose **Ouvrir la dernière exécution** et, pour le propriétaire du projet, **Lancer maintenant**, **Mettre en pause** ou **Réactiver**, **Modifier** et **Déplacer vers la corbeille**. Voir [Gérer et vérifier les exécutions](/fr/documentation/scheduled-routines#runs).
- Une ligne de pull request propose les changements que son état actuel autorise, **Fusionner** lorsqu’elle est prête, et des actions de correction lorsqu’un problème la bloque. Voir [Revue et fusion](/fr/documentation/code-work#decision).

L’action s’applique à la ligne sur laquelle vous avez cliqué, même lorsqu’un autre projet ou élément est ouvert.

### Panneaux et navigation mobile {#panels}

Un ticket s’ouvre dans un panneau de détail qui laisse le tableau sous-jacent disponible. Une page ouverte depuis une mention ou un lien s’affiche de la même façon, dans un panneau latéral avec **Agrandir** pour atteindre la page entière. Le bouton flottant Numo ouvre le panneau commun de conversations. La boîte de réception est un volet de navigation avec notifications et invitations. Les anciens liens vers des pages dédiées Numo ou Inbox renvoient vers les accès actuels ; ils n’indiquent pas des écrans distincts.

Sur mobile, ouvrez le tiroir de navigation pour atteindre les mêmes destinations. La barre en bas de l’écran réunit, de gauche à droite, le tiroir de navigation, Numo, la recherche, le carnet de tâches et **Nouveau** ; **Accueil** se trouve dans le tiroir. Une barre de chargement en haut indique qu’un changement de page est en cours, y compris pendant la fin des enregistrements en attente. Les panneaux utilisent la largeur disponible ; fermez le panneau ou revenez en arrière pour retrouver la liste. Utilisez les boutons visibles lorsqu’aucun raccourci clavier n’est disponible.

### Onglets desktop {#tabs}

L’application desktop ajoute des onglets natifs et un sélecteur de serveur. Un onglet est une surface de navigation, pas un autre compte ni une autre adhésion au projet. Vérifiez l’instance lors d’un changement de serveur. La [section de l’application desktop](/fr/documentation/applications#desktop-app) décrit installation, raccourcis natifs et mises à jour ; les permissions des pages et tickets restent applicables.

## Retrouver le travail et agir au clavier {#search-and-shortcuts}

Ouvrez la palette de commandes depuis la recherche de navigation. Cherchez un titre distinctif ou un identifiant de ticket, puis choisissez un résultat. La recherche couvre le travail accessible au compte ; connaître un identifiant n’ouvre pas un autre projet. La commande Documentation ouvre le manuel public dans votre langue actuelle.

Dès que vous tapez, la palette trouve aussi les routines, les pull requests, les vues et les notifications de l’**Inbox** ; elles n’apparaissent pas dans la liste affichée avant la saisie. Les routines et les pull requests apparaissent si votre offre les inclut, et les pull requests couvrent les 100 plus récemment mises à jour dans vos dépôts liés. Les vues couvrent **Tous les tickets** et le projet dans lequel vous vous trouvez. Choisir une routine, une pull request ou une vue l’ouvre. Choisir une notification ouvre l’**Inbox** sur l’onglet qui la liste, **Non lues** ou **Toutes**, fait défiler jusqu’à elle et la met brièvement en évidence ; elle reste non lue tant que vous ne l’ouvrez pas. Les projets que vous avez masqués restent absents de ces résultats.

Le choix de ce que vous liez se fait aussi dans la palette. Ajouter une relation, lier un ticket à une pull request ou une pull request à un ticket, et joindre une page comme ressource l’ouvrent sur les seuls éléments que vous pouvez choisir, et son champ de recherche indique ce que vous cherchez. Pour une relation, choisissez d’abord son type dans le menu ; la palette liste ensuite les tickets et objectifs qui peuvent la prendre. Choisir un élément le lie ; Échap ferme la palette sans rien lier.

Utilisez Commande+K sur macOS ou Ctrl+K sur Windows/Linux pour ouvrir la palette ; Commande/Ctrl+P constitue une autre combinaison de l’application. Hors d’un champ de texte, ? ouvre l’aide des raccourcis et C la création de ticket. Sur une carte survolée ou les commandes de détail compatibles, S ouvre l’état, P la priorité, E l’effort, A le responsable, L les catégories, D l’échéance et O l’objectif. R ajoute une relation depuis les mêmes endroits, sur la page d’un objectif et dans le formulaire de nouveau ticket : choisissez le type de relation, puis l’autre ticket ou objectif. Si la carte fait partie d’une sélection, ces touches modifient tous les tickets sélectionnés ; le responsable, l’objectif, les catégories et les relations ne s’appliquent qu’aux tickets sélectionnés du projet de cette carte. Maj+C mène à un champ de commentaire prêt pour la saisie, le fil défilé jusqu’à son dernier message : celui d’une carte de ticket survolée ou d’une ligne survolée dans la liste des objectifs, des retours, des pull requests, des pages ou du triage, ou, sans rien survoler, celui du ticket, de l’objectif, du retour, de la pull request ou de la page à l’écran. Une page ouvre pour cela son panneau **Activité**. Maj+C ne concerne que cet élément, même si la carte fait partie d’une sélection. Sur la page d’un objectif et dans le formulaire de nouvel objectif, S ouvre son état, A son responsable, D sa date cible et C sa couleur ; à ces endroits, C ne crée pas de ticket. Ces touches seules n’interceptent pas la saisie dans un champ, une zone de texte ou un éditeur. Les séquences G puis H (Accueil) et G puis I (Boîte de réception) utilisent deux touches successives ; G puis W ouvre les pages uniquement dans le contexte d’un projet. Sur l’**Accueil** et dans le panneau Numo agrandi, une rafale rapide de touches s’écrit plutôt dans le champ de saisie de Numo, et une touche seule lance son raccourci après une courte pause ([écrire à Numo](/docs/numo#work-with-numo)).

Pour atteindre un réglage, tapez son nom dans la palette de commandes ou dans le champ de filtre en haut de la barre latérale des paramètres. Les deux trouvent chaque carte de réglages et les réglages individuels, comme la langue, le thème, chaque palette, la transparence et les deux interrupteurs de **Démarrer un ticket**. Choisir un résultat ouvre le bon onglet des paramètres, fait défiler jusqu’à la carte ou la ligne et la met en évidence. Commande+T sur macOS ou Ctrl+T sur Windows/Linux ouvre la palette du nouvel onglet ; un réglage choisi depuis celle-ci s’ouvre dans un nouvel onglet de l’app. Dans un projet, elle propose aussi **Nouvelle page**, qui crée une page dans ce projet et l’ouvre dans un nouvel onglet. Les mots-clés anglais et français fonctionnent quelle que soit la langue de l’interface.

Commande+F sur macOS ou Ctrl+F sur Windows/Linux recherche dans la page ou le carnet de tâches à l’écran avec la [barre de recherche et de remplacement](/fr/documentation/pages#find-and-replace) de minddy. Sur les autres écrans, et lorsqu’une autre boîte de dialogue est ouverte au-dessus de la page, il ouvre la recherche du navigateur.

Consultez l’aide des raccourcis pour votre plateforme. minddy distingue raccourcis de l’application, actions de propriétés des tickets et commandes natives d’onglets ou de fenêtres desktop. Vérifiez le focus avant une commande : saisir dans un éditeur et agir sur le ticket environnant sont des contextes différents.

![Résultats de recherche pour l’identifiant d’un ticket de démonstration.](/documentation/fr/work-search.png)

### Ordre des tickets dans la recherche {#issue-search-order}

Toutes les recherches de tickets affichent les tickets dans le même ordre : la palette, les mentions `@`, les sélecteurs de relations, de doublon et de pull request, la fenêtre **Lier à un ticket existant** des retours, et la recherche utilisée par Numo et les agents MCP. Les tickets **En cours** et **En revue** viennent d’abord, puis les tickets **Backlog** et **À faire**. Les tickets **Triage**, **Terminé**, **Annulé** et **Doublon** viennent toujours en dernier et restent sélectionnables. Dans chaque groupe, la meilleure correspondance de texte passe en premier. Un identifiant tapé en entier, comme `MIN-42`, place ce ticket en tête, quel que soit son statut.

### Chercher des tickets par le sens {#search-by-meaning}

Quand une requête décrit le travail au lieu de le nommer, la recherche de tickets trouve aussi les tickets de sens proche, même s’ils emploient d’autres mots. Par exemple, « la connexion échoue après une réinitialisation du mot de passe » peut trouver un ticket intitulé « Session perdue au changement de mot de passe ». C’est le cas dans la palette de commandes, les mentions `@` des descriptions, des pages, des commentaires et du compositeur de Numo, les sélecteurs de relation, **Marquer comme doublon…** dans le triage, **Lier un ticket** sur une pull request, le menu **Ajouter du contexte** → **Ticket** de Numo et **Lier à un ticket existant** sur un feedback.

Les correspondances textuelles et les identifiants exacts passent toujours en premier et gardent leur ordre. Peu après la fin de la saisie, au plus cinq tickets trouvés par le sens s’ajoutent à leur suite sous **Liés par le sens**. En attendant, une ligne **Recherche par le sens…** indique que la recherche est en cours (dans la palette de commandes, seulement si aucun résultat textuel ne correspond). Si aucun n’est trouvé, elle indique **Aucun ticket lié par le sens** ; un menu `@` sans correspondance textuelle se ferme à la place. Un ticket déjà affiché n’est pas répété et la ligne en surbrillance ne bouge pas. Chaque sélecteur garde ses propres règles : seuls les tickets qu’il pouvait déjà proposer apparaissent. Un sélecteur de relation, par exemple, ne propose toujours que des tickets du même projet qui ne sont pas encore liés. La palette de commandes cherche dans les projets que vous pouvez lire, jusqu’aux 25 mis à jour le plus récemment ; ses actions de sélection groupée n’utilisent pas la recherche par le sens.

La recherche par le sens a ces limites :

- La requête doit compter au moins deux mots, ou un mot d’au moins six lettres. Les identifiants comme `MIN-42`, `#42` ou `42`, ainsi que les requêtes très courtes, n’utilisent que la recherche textuelle.
- Elle s’appuie sur l’index que Smart-fill construit à partir du titre et de la description des tickets. Un ticket pas encore indexé, ou dont l’auteur a désactivé [**Indexer les tickets**](/docs/issues#smart-fill-preferences), n’est trouvé que par ses mots. Les tickets de la corbeille n’apparaissent jamais.
- Si vous avez désactivé **Indexer les tickets** dans **Paramètres du compte** → **Smart Fill** → **Indexation des tickets**, vos recherches ne comparent que les mots. Il en va de même quand votre budget IA est épuisé ou quand le fournisseur ne répond pas en quelques secondes. Les résultats textuels restent et aucune erreur n’est affichée.
- Une requête `@` dont le texte correspond déjà à une personne, un projet ou une page n’est pas cherchée par le sens. Dans un projet de plus de 3 000 tickets indexés, seuls les 3 000 indexés le plus récemment sont comparés ; les autres sont trouvés par leurs mots.

Chaque nouvelle requête utilise un appel d’IA, compté dans votre part **Automatisations** et affiché dans l’historique d’usage sous **Recherche de tickets**. Une requête répétée dans les 15 minutes environ n’est normalement pas facturée à nouveau.

### Utiliser une commande visible équivalente {#shortcut-alternatives}

Les propriétés disposent de sélecteurs visibles en plus des actions clavier. Utilisez-les sur mobile ou si un raccourci est intercepté par le navigateur ou le système. Fermez un volet ou replacez le focus sur la bonne surface avant une autre action.

La recherche peut retrouver un ticket masqué par les filtres du tableau. Si un résultat manque, vérifiez projet, compte et instance, puis précisez la requête. Ne créez pas de doublon parce que la vue cache une tâche. La documentation publique possède sa recherche textuelle localisée, indépendante de Numo et des fournisseurs.
