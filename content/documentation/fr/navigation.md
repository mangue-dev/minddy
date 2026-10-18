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
  "revision": 10,
  "sourceRevision": 10,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-18",
  "compatibility": {
    "version": "0.11.1 development (UI refinements); MIN-685 sidebar context menus; MIN-692 hidden projects; MIN-718 hybrid issue search; MIN-726 issue search order",
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
      "content/documentation/reviews/ui-refinements-2026-10-11.md",
      "components/project-context-actions.tsx",
      "lib/sidebar-context-actions.ts",
      "components/routines/routines-panel.tsx",
      "components/pull-requests/pr-context-actions.tsx",
      "content/documentation/reviews/min-685-sidebar-context-actions.md",
      "lib/use-hidden-projects.ts",
      "content/documentation/reviews/min-692-hidden-projects.md",
      "lib/issue-semantic-query.ts",
      "lib/use-semantic-issue-search.ts",
      "lib/server/issue-semantic-search.ts",
      "app/api/issues/semantic-search/route.ts",
      "lib/use-semantic-mentions.ts",
      "lib/issue-search-order.ts",
      "content/documentation/reviews/min-718-hybrid-issue-search.md",
      "components/app-tab-strip.tsx",
      "lib/app-tab-indicators.ts"
    ]
  },
  "review": {
    "revision": 10,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (Documentation command and mobile transition source review; unchanged evidence retained); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 7; fr translation of added passages; no operational rerun); agent:/root (MIN-692 hidden-project source, route and unit-test review; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-695 badge propagation: source and unit-test review of app-shell-chrome, app-sidebar, mobile-navigation, app-tab-strip and lib/app-tab-indicators; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root (fr changed-passage parity and label review); agent:/root (fr translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (fr MIN-692 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root (fr translation of MIN-718 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (fr MIN-695 badge paragraph, catalog UI labels and retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-18"
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
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-08",
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
      "revision": 10,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        788,
        364
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

La navigation principale donne accès au travail personnel et aux projets. Sélectionnez un projet pour consulter ses tickets et ses destinations secondaires : triage, objectifs, pages et réglages du projet. La ligne de retour remonte d’un niveau de navigation ; elle peut modifier la barre latérale tout en laissant la page principale ouverte. Choisissez une destination pour y naviguer.

Les compteurs et les alertes vous suivent d’un niveau à l’autre. Le contrôle qui ramène à l’**Accueil** affiche le total à trier dans les projets que liste l’**Accueil**, projet courant compris, ainsi que l’alerte Smart Assign quand l’un de vos projets manque de règles. Une ligne de retour affiche le compteur du niveau vers lequel elle remonte. Dans un projet, **Triage** et **Retours** gardent les compteurs propres à ce projet. Les onglets de l’app de bureau portent le même badge que leur entrée de la barre latérale : l’alerte sur l’**Accueil**, et les compteurs sur **Inbox**, **Code review**, ainsi que **Triage** et **Retours** d’un projet, mis à jour même quand l’onglet est en arrière-plan.

Les cycles personnels et les vues transversales couvrent les projets accessibles à votre compte. Les objectifs, le wiki et les retours appartiennent à un projet précis. Vérifiez le projet actif avant de créer du travail ou de modifier ses réglages.

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

Sur mobile, une barre de chargement en haut indique qu’un changement de page est en cours, y compris pendant la fin des enregistrements en attente.

Un ticket s’ouvre dans un panneau de détail qui laisse le tableau sous-jacent disponible. Le bouton flottant Numo ouvre le panneau commun de conversations. La boîte de réception est un volet de navigation avec notifications et invitations. Les anciens liens vers des pages dédiées Numo ou Inbox renvoient vers les accès actuels ; ils n’indiquent pas des écrans distincts.

Sur mobile, ouvrez le tiroir de navigation pour atteindre les mêmes destinations. Les panneaux utilisent la largeur disponible ; fermez le panneau ou revenez en arrière pour retrouver la liste. Utilisez les boutons visibles lorsqu’aucun raccourci clavier n’est disponible.

### Onglets desktop {#tabs}

L’application desktop ajoute des onglets natifs et un sélecteur de serveur. Un onglet est une surface de navigation, pas un autre compte ni une autre adhésion au projet. Vérifiez l’instance lors d’un changement de serveur. La [section de l’application desktop](/fr/documentation/applications#desktop-app) décrit installation, raccourcis natifs et mises à jour ; les permissions des pages et tickets restent applicables.

## Retrouver le travail et agir au clavier {#search-and-shortcuts}

La commande Documentation ouvre le manuel public dans votre langue actuelle.

Ouvrez la palette de commandes depuis la recherche de navigation. Cherchez un titre distinctif ou un identifiant de ticket, puis choisissez un résultat. La recherche couvre le travail accessible au compte ; connaître un identifiant n’ouvre pas un autre projet.

Utilisez Commande+K sur macOS ou Ctrl+K sur Windows/Linux pour ouvrir la palette ; Commande/Ctrl+P constitue une autre combinaison de l’application. Hors d’un champ de texte, ? ouvre l’aide des raccourcis et C la création de ticket. Sur une carte survolée ou les commandes de détail compatibles, S ouvre l’état, P la priorité, E l’effort, A le responsable, L les catégories, D l’échéance et O l’objectif. Ces touches seules n’interceptent pas la saisie dans un champ, une zone de texte ou un éditeur. Les séquences G puis H (Accueil) et G puis I (Boîte de réception) utilisent deux touches successives ; G puis W ouvre les pages uniquement dans le contexte d’un projet.

Consultez l’aide des raccourcis pour votre plateforme. minddy distingue raccourcis de l’application, actions de propriétés des tickets et commandes natives d’onglets ou de fenêtres desktop. Vérifiez le focus avant une commande : saisir dans un éditeur et agir sur le ticket environnant sont des contextes différents.

![Résultats de recherche pour l’identifiant d’un ticket de démonstration.](/documentation/fr/work-search.png)

### Ordre des tickets dans la recherche {#issue-search-order}

Toutes les recherches de tickets affichent les tickets dans le même ordre : la palette, les mentions `@`, les sélecteurs de relations, de doublon et de pull request, la fenêtre **Lier à un ticket existant** des retours, et la recherche utilisée par Numo et les agents MCP. Les tickets **En cours** et **En revue** viennent d’abord, puis les tickets **Backlog** et **À faire**. Les tickets **Triage**, **Terminé**, **Annulé** et **Doublon** viennent toujours en dernier et restent sélectionnables. Dans chaque groupe, la meilleure correspondance de texte passe en premier. Un identifiant tapé en entier, comme `MIN-42`, place ce ticket en tête, quel que soit son statut.

### Chercher des tickets par le sens {#search-by-meaning}

Quand une requête décrit le travail au lieu de le nommer, la recherche de tickets trouve aussi les tickets de sens proche, même s’ils emploient d’autres mots. Par exemple, « la connexion échoue après une réinitialisation du mot de passe » peut trouver un ticket intitulé « Session perdue au changement de mot de passe ». C’est le cas dans la palette de commandes, les mentions `@` des descriptions, des pages, des commentaires et du compositeur de Numo, les sélecteurs de relation, **Marquer comme doublon…** dans le triage, **Lier un ticket** sur une pull request, le menu **Ajouter du contexte** → **Ticket** de Numo et **Lier à un ticket existant** sur un feedback.

Les correspondances textuelles et les identifiants exacts passent toujours en premier et gardent leur ordre. Peu après la fin de la saisie, au plus cinq tickets trouvés par le sens s’ajoutent à leur suite sous **Liés par le sens**. Un ticket déjà affiché n’est pas répété et la ligne en surbrillance ne bouge pas. Chaque sélecteur garde ses propres règles : seuls les tickets qu’il pouvait déjà proposer apparaissent. Un sélecteur de relation, par exemple, ne propose toujours que des tickets du même projet qui ne sont pas encore liés. La palette de commandes cherche dans les projets que vous pouvez lire, jusqu’aux 25 mis à jour le plus récemment ; ses actions de sélection groupée n’utilisent pas la recherche par le sens.

La recherche par le sens a ces limites :

- La requête doit compter au moins deux mots, ou un mot d’au moins six lettres. Les identifiants comme `MIN-42`, `#42` ou `42`, ainsi que les requêtes très courtes, n’utilisent que la recherche textuelle.
- Elle s’appuie sur l’index que Smart-fill construit à partir du titre et de la description des tickets. Un ticket pas encore indexé, ou dont l’auteur a désactivé [**Indexer les tickets**](/docs/issues#smart-fill-preferences), n’est trouvé que par ses mots. Les tickets de la corbeille n’apparaissent jamais.
- Si vous avez désactivé **Indexer les tickets** dans **Paramètres du compte** → **Préférences**, vos recherches ne comparent que les mots. Il en va de même quand l’administrateur de l’instance a désactivé **Relations Smart Fill**, quand votre budget IA est épuisé ou quand le fournisseur ne répond pas en quelques secondes. Les résultats textuels restent et aucune erreur n’est affichée.
- Une requête `@` dont le texte correspond déjà à une personne, un projet ou une page n’est pas cherchée par le sens. Dans un projet de plus de 3 000 tickets indexés, seuls les 3 000 indexés le plus récemment sont comparés ; les autres sont trouvés par leurs mots.

Chaque nouvelle requête utilise un appel d’IA, compté dans votre part **Automatisations** et affiché dans l’historique d’usage sous **Recherche de tickets**. Une requête répétée dans les 15 minutes environ n’est normalement pas facturée à nouveau.

### Utiliser une commande visible équivalente {#shortcut-alternatives}

Les propriétés disposent de sélecteurs visibles en plus des actions clavier. Utilisez-les sur mobile ou si un raccourci est intercepté par le navigateur ou le système. Fermez un volet ou replacez le focus sur la bonne surface avant une autre action.

La recherche peut retrouver un ticket masqué par les filtres du tableau. Si un résultat manque, vérifiez projet, compte et instance, puis précisez la requête. Ne créez pas de doublon parce que la vue cache une tâche. La documentation publique possède sa recherche textuelle localisée, indépendante de Numo et des fournisseurs.
