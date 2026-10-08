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
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "lib/keyboard/keyboard-context.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
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
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    },
    {
      "id": "search-and-shortcuts-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-search.png",
      "alt": "Résultats de recherche pour l’identifiant d’un ticket de démonstration.",
      "caption": "La palette retrouve le ticket par identifiant avec les pages du projet ; ouvrir un résultat conserve ses règles d’accès.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
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

### Panneaux et navigation mobile {#panels}

Un ticket s’ouvre dans un panneau de détail qui laisse le tableau sous-jacent disponible. Le bouton flottant Numo ouvre le panneau commun de conversations. La boîte de réception est un volet de navigation avec notifications et invitations. Les anciens liens vers des pages dédiées Numo ou Inbox renvoient vers les accès actuels ; ils n’indiquent pas des écrans distincts.

Sur mobile, ouvrez le tiroir de navigation pour atteindre les mêmes destinations. Les panneaux utilisent la largeur disponible ; fermez le panneau ou revenez en arrière pour retrouver la liste. Utilisez les boutons visibles lorsqu’aucun raccourci clavier n’est disponible.

### Onglets desktop {#tabs}

L’application desktop ajoute des onglets natifs et un sélecteur de serveur. Un onglet est une surface de navigation, pas un autre compte ni une autre adhésion au projet. Vérifiez l’instance lors d’un changement de serveur. La [section de l’application desktop](/fr/documentation/applications#desktop-app) décrit installation, raccourcis natifs et mises à jour ; les permissions des pages et tickets restent applicables.

## Retrouver le travail et agir au clavier {#search-and-shortcuts}

Ouvrez la palette de commandes depuis la recherche de navigation. Cherchez un titre distinctif ou un identifiant de ticket, puis choisissez un résultat. La recherche couvre le travail accessible au compte ; connaître un identifiant n’ouvre pas un autre projet.

Utilisez Commande+K sur macOS ou Ctrl+K sur Windows/Linux pour ouvrir la palette ; Commande/Ctrl+P constitue une autre combinaison de l’application. Hors d’un champ de texte, ? ouvre l’aide des raccourcis et C la création de ticket. Sur une carte survolée ou les commandes de détail compatibles, S ouvre l’état, P la priorité, E l’effort, A le responsable, L les catégories, D l’échéance et O l’objectif. Ces touches seules n’interceptent pas la saisie dans un champ, une zone de texte ou un éditeur. Les séquences G puis H (Accueil) et G puis I (Boîte de réception) utilisent deux touches successives ; G puis W ouvre les pages uniquement dans le contexte d’un projet.

Consultez l’aide des raccourcis pour votre plateforme. Minddy distingue raccourcis de l’application, actions de propriétés des tickets et commandes natives d’onglets ou de fenêtres desktop. Vérifiez le focus avant une commande : saisir dans un éditeur et agir sur le ticket environnant sont des contextes différents.

![Résultats de recherche pour l’identifiant d’un ticket de démonstration.](/documentation/fr/work-search.png)

### Utiliser une commande visible équivalente {#shortcut-alternatives}

Les propriétés disposent de sélecteurs visibles en plus des actions clavier. Utilisez-les sur mobile ou si un raccourci est intercepté par le navigateur ou le système. Fermez un volet ou replacez le focus sur la bonne surface avant une autre action.

La recherche peut retrouver un ticket masqué par les filtres du tableau. Si un résultat manque, vérifiez projet, compte et instance, puis précisez la requête. Ne créez pas de doublon parce que la vue cache une tâche. La documentation publique possède sa recherche textuelle localisée, indépendante de Numo et des fournisseurs.
