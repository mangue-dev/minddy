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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 development (UI refinements); MIN-685 sidebar context menus",
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
      "content/documentation/reviews/min-685-sidebar-context-actions.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (Documentation command and mobile transition source review; unchanged evidence retained); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 7; fr translation of added passages; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root (fr changed-passage parity and label review); agent:/root (fr translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-17"
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
      "revision": 7,
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
      "revision": 7,
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

Les cycles personnels et les vues transversales couvrent les projets accessibles à votre compte. Les objectifs, le wiki et les retours appartiennent à un projet précis. Vérifiez le projet actif avant de créer du travail ou de modifier ses réglages.

![Navigation du projet à côté du tableau de tickets de démonstration.](/documentation/fr/work-navigation.png)

### Agir depuis une ligne de la barre latérale {#sidebar-menus}

Faites un clic droit sur une ligne de la barre latérale pour agir sur ce qu’elle représente sans l’ouvrir d’abord. Les lignes de lien proposent aussi **Ouvrir dans un nouvel onglet** et **Copier le lien**. Une action qui place un élément dans la corbeille vient toujours en dernier, après un séparateur.

- La ligne **Tous les tickets** propose **Nouveau ticket**, et la ligne **Routines** propose **Nouvelle routine** si vous êtes propriétaire d’un projet.
- Une ligne de projet, ou le nom du projet en haut de son panneau, propose **Nouveau** (un ticket, un objectif ou une page dans ce projet) et **Paramètres du projet**. Le propriétaire du projet voit aussi **Déplacer vers la corbeille**, qui demande la même confirmation que les paramètres du projet.
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

### Utiliser une commande visible équivalente {#shortcut-alternatives}

Les propriétés disposent de sélecteurs visibles en plus des actions clavier. Utilisez-les sur mobile ou si un raccourci est intercepté par le navigateur ou le système. Fermez un volet ou replacez le focus sur la bonne surface avant une autre action.

La recherche peut retrouver un ticket masqué par les filtres du tableau. Si un résultat manque, vérifiez projet, compte et instance, puis précisez la requête. Ne créez pas de doublon parce que la vue cache une tâche. La documentation publique possède sa recherche textuelle localisée, indépendante de Numo et des fournisseurs.
