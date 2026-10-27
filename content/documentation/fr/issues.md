---
{
  "id": "issues",
  "locale": "fr",
  "title": "Tickets",
  "summary": "Créez et organisez les tickets, suivez leur cycle de vie, gérez les dépendances et les plans, puis importez ou modifiez le travail en masse.",
  "topic": "Projets et tickets",
  "type": "guide",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "W01",
    "W03",
    "W02",
    "W08",
    "W05",
    "W06",
    "W07",
    "W09",
    "W04",
    "A06",
    "A11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 38,
  "sourceRevision": 38,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-27",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review); MIN-753 drafts tray; MIN-750 Smart Fill re-evaluation; MIN-804 parent and sub-issue relations; MIN-798 Smart Fill titles; MIN-809 Smart Fill split button; MIN-813 Smart Fill title on request",
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
      "content/knowledge/core-tracker.md",
      "components/create-issue-dialog.tsx",
      "components/issue-fields.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts",
      "lib/smart-fill-fields.ts",
      "lib/server/smart-fill-reevaluation.ts",
      "lib/server/smart-fill-ownership.ts",
      "lib/server/smart-fill-title.ts",
      "app/(app)/projects/[id]/triage/page.tsx",
      "components/triage/triage-page.tsx",
      "lib/smart-triage.ts",
      "lib/view-filter.ts",
      "components/kanban-board.tsx",
      "components/issue-context-menu.tsx",
      "components/issue-timeline.tsx",
      "components/issue-resources-section.tsx",
      "components/issue-side-panel.tsx",
      "components/issue-indicators.tsx",
      "lib/server/issue-relations.ts",
      "lib/relation-constants.ts",
      "components/issue-parent-menu.tsx",
      "components/issue-family-banner.tsx",
      "lib/server/create-issue.ts",
      "lib/server/update-issue.ts",
      "content/knowledge/plans-and-agents.md",
      "components/issue-plan.tsx",
      "captures/shots/issue-plan/intent.md",
      "lib/plan.ts",
      "components/settings/project-recurrences-section.tsx",
      "lib/server/recurrence.ts",
      "components/bulk-issue-actions.tsx",
      "components/global-board.tsx",
      "components/issue-card.tsx",
      "components/marquee-selection.tsx",
      "components/command-palette.tsx",
      "components/settings/csv-import-panel.tsx",
      "components/settings/import-mapping-editor.tsx",
      "lib/use-csv-import.ts",
      "lib/import/types.ts",
      "lib/server/import-issues.ts",
      "components/export-issues-dialog.tsx",
      "components/app-shell-chrome.tsx",
      "app/api/me/issues/export/route.ts",
      "lib/export/issues-csv.ts",
      "lib/export-api.ts",
      "components/file-viewer.tsx",
      "components/image-viewer.tsx",
      "lib/issue-prompt.ts",
      "lib/server/issue-prompt-context.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/server/issue-relation-inference.ts",
      "lib/server/issue-relation-decision.ts",
      "lib/server/issue-embedding-store.ts",
      "components/settings/account-preferences-section.tsx",
      "lib/issue-semantic-query.ts",
      "lib/server/issue-semantic-search.ts",
      "components/relation-target-picker.tsx",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/settings/account-smart-fill-section.tsx",
      "components/creation-project-select.tsx",
      "lib/use-resource-mentions.ts",
      "components/relations-section.tsx",
      "components/objective-relations-section.tsx",
      "components/issue-field-shortcuts.tsx",
      "components/creation-relations.tsx",
      "lib/keyboard/shortcuts.ts",
      "lib/server/assistant/prompt.ts",
      "components/drafts-tray.tsx",
      "lib/use-all-drafts.ts",
      "lib/use-held-draft.ts",
      "lib/issue-hierarchy.ts"
    ]
  },
  "review": {
    "revision": 38,
    "fact": "agent:claude-code (MIN-813 Smart-fill title paragraph checked against components/create-issue-dialog.tsx and components/issue-compact-fields.tsx: while Smart-fill writes the title only the description shows, Set manually → Title reveals and focuses the title field, an empty field leaves on blur, switching Smart-fill off shows it; plain placeholders; new-issue figure shows Smart-fill off with the title visible and stays accurate, no figure changed); agent:claude-code (MIN-809 manual-creation paragraph checked against components/issue-compact-fields.tsx and components/create-issue-dialog.tsx: the arrow next to the Smart-fill button lists priority, effort, categories and objective, each with a submenu of values, and the chosen value brings the property back to the form; property keys unchanged; new-issue figure recaptured on 2026-10-27 in six locales from the working tree on the local dev server against the preview demo account, Smart-fill off with its arrow visible, writes blocked, nothing submitted, each image inspected); agent:claude-code (MIN-798 Smart-fill title section and preference bullet checked against lib/smart-fill.ts, lib/server/smart-fill-title.ts, lib/server/create-issue.ts, lib/server/smart-fill-reevaluation.ts, lib/server/update-issue.ts, components/create-issue-dialog.tsx and components/settings/account-smart-fill-section.tsx: on by default under the master switch, description focus, smaller empty title until focused or filled, and placeholders in the form, first-line fallback, ownership released by a manual edit, re-evaluation skipped for an editor who turned titles off; MCP requires a title; no figure changed); agent:claude-code (MIN-804 sub-issues paragraph checked against lib/issue-hierarchy.ts, components/issue-card.tsx, components/relations-section.tsx and the enforce_one_level_subissues trigger: R and the right-click Relations entry offer Parent of / Sub-issue of only where the one-level rule allows, re-parenting moves the issue, a selection uses Sub-issue of; no figure changed); agent:/root/min776 (drafts paragraph checked against components/create-issue-dialog.tsx, components/objective-dialog.tsx and lib/use-held-draft.ts: closing keeps the form, reopening resumes it, two minutes after a close it becomes a draft, another context saves it first, and the split menu offers Save as draft; rest of the article unchanged since the MIN-778 review; no figure changed); agent:claude-code (MIN-762 UI label correction: quoted labels aligned on the corrected fr catalog; no behavior change, no new captures); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:claude-code (fr MIN-813 Smart-fill title paragraph with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-809 manual-creation paragraph; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-798 Smart-fill title section with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-804 sub-issues paragraph with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:/root/min776 (fr drafts paragraph with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-762 label edit; self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-27"
  },
  "related": [
    "feedback",
    "trash-and-recovery",
    "pages",
    "notifications-and-inbox",
    "objectives",
    "code-work",
    "scheduled-routines",
    "projects",
    "views",
    "personal-cycle"
  ],
  "aliases": [
    "create-an-issue",
    "triage-incoming-work",
    "issue-statuses",
    "issue-discussion-and-resources",
    "issue-dependencies",
    "sub-issues",
    "implementation-plans",
    "recurring-issues",
    "bulk-issue-actions",
    "import-issues"
  ],
  "tags": [
    "Créer et modifier un ticket",
    "Examiner le travail entrant dans le triage",
    "Faire évoluer l’état d’un ticket",
    "Discuter du travail et joindre son contexte",
    "Lier dépendances et tickets associés",
    "Découper un ticket en sous-tickets",
    "Maintenir un plan d’implémentation",
    "Répéter un ticket après sa réalisation",
    "Modifier plusieurs tickets ensemble",
    "Importer un backlog CSV après contrôle"
  ],
  "figures": [
    {
      "id": "create-an-issue-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/new-issue.png",
      "alt": "Brouillon de ticket non envoyé dans le projet Aurora, avec titre, description, propriétés manuelles et le bouton Créer AUR-21.",
      "caption": "Décrivez le résultat attendu, puis choisissez les propriétés utiles avant de créer le ticket.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-10-27",
      "viewport": [
        720,
        396
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/triage-incoming.png",
      "alt": "Ticket de démonstration AUR-19 reçu dans le triage, avec son signalement, ses propriétés et les commandes Doublon, Refuser et Accepter.",
      "caption": "Lisez le signalement reçu avant de l’accepter, de le refuser ou de le relier à un doublon.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1154,
        786
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/issue-statuses.png",
      "alt": "Les huit statuts du ticket dans le sélecteur, avec Backlog sélectionné.",
      "caption": "La coche indique le statut actuel. Choisissez celui qui reflète l’état réel du travail.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        288,
        358
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-discussion-and-resources-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-resources.png",
      "alt": "Dialogue d’ajout de lien avec une adresse de contact d’exemple.",
      "caption": "Vérifiez la destination avant d’ajouter la ressource. Ce lien d’exemple n’a pas été envoyé.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        496,
        212
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-dependencies-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-dependencies.png",
      "alt": "Recherche d’un préalable par identifiant de ticket.",
      "caption": "Choisissez le sens de la relation avant sa destination. Aucune relation n’a été envoyée dans ce sélecteur.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        368,
        184
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "sub-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-sub-issues.png",
      "alt": "Champ de création d’un sous-ticket dans un parent de démonstration.",
      "caption": "Ce champ crée un enfant sous le parent ; chaque enfant conserve son état et sa discussion.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "implementation-plans-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-implementation-plan.png",
      "alt": "Plan de démonstration avec deux tâches de travail terminées sur six.",
      "caption": "Le plan enregistré distingue les étapes terminées, actives et en attente. Sa progression ne prouve pas l’exécution de la tâche de code fictive.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        508,
        1416
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "recurring-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/issue-date-recurrence.png",
      "alt": "Sélecteur d’échéance en mode récurrent avec aperçu hebdomadaire le dimanche et heure optionnelle.",
      "caption": "Le mode récurrent prévisualise la cadence hebdomadaire. Confirmez la première échéance avant de créer le ticket.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        324,
        540
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-issues-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/import-issues-preview-workflow.png",
      "alt": "Aperçu CSV de deux lignes de démonstration localisées et des colonnes détectées.",
      "caption": "Aperçu CSV de deux lignes de démonstration localisées et des colonnes détectées. Aucun import n’a été lancé ; la préparation IA optionnelle a été bloquée pour la capture.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        816,
        977
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "issue-file-preview",
      "kind": "screenshot",
      "src": "/documentation/fr/file-preview.png",
      "alt": "Lecteur CSV sur toute la fenêtre avec des tâches de projet d’exemple, un grand bouton Fermer et le menu Actions du fichier proposant Télécharger, Renommer et Retirer.",
      "caption": "Le lecteur commun place Fermer sous l’aperçu. Le menu Actions du fichier propose Télécharger et, si les droits le permettent, Renommer et Retirer.",
      "revision": 38,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        1168,
        808
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "create-an-issue-steps",
    "triage-incoming-work-steps",
    "issue-statuses-steps",
    "issue-discussion-and-resources-steps",
    "issue-dependencies-steps",
    "sub-issues-steps",
    "implementation-plans-steps",
    "recurring-issues-steps",
    "import-issues-workflow",
    "issue-file-preview"
  ]
}
---

Un ticket suit un travail dans un projet, de son signalement à sa clôture. Commencez par la création, le triage et les états, ou consultez les sections sur les discussions, les dépendances, les sous-tickets et les plans pour un travail déjà engagé. Les récurrences, les actions groupées et l’import CSV demandent des vérifications spécifiques avant application.

## Créer et modifier un ticket {#create-an-issue}

Vous devez être propriétaire ou Membre du projet destinataire ; les lecteurs peuvent ouvrir les tickets, mais ni les créer ni les modifier. Ouvrez le projet et sa commande de création de ticket. Saisissez un titre qui nomme le travail, puis décrivez contexte, résultat attendu et contraintes. Le titre et la description se comportent comme un seul texte : sur ordinateur, la flèche bas sur la dernière ligne du titre passe à la première ligne de la description, la flèche haut revient, et le curseur garde à peu près sa place sur la ligne. Maj+Entrée dans le titre passe à la description ; Entrée aussi, sauf si vous avez choisi Entrée comme raccourci d’envoi, auquel cas il crée le ticket. Commande/Ctrl+Entrée le crée depuis l’un ou l’autre champ. Les mêmes flèches et Entrée relient le titre et la description d’un ticket, d’un objectif, d’une page ou d’un retour ouverts. Le formulaire s’ouvre sur le projet courant ; choisissez-en un autre dans **Créer dans**, en haut à gauche du formulaire (à côté du titre **Nouveau ticket** sur téléphone), en particulier depuis une vue personnelle ou transversale. Sur ordinateur, Commande/Ctrl+Maj+P ouvre ce menu, même pendant la saisie du titre ou de la description ; une fois le projet choisi ou le menu fermé, le curseur revient exactement où il était. La pastille affiche ce raccourci, qui n’existe que si plusieurs projets peuvent être choisis ; sur téléphone, aucun raccourci n’est indiqué. Changer de projet efface les catégories, l’objectif et les relations choisis pour le précédent. Le bouton de création affiche l’identifiant que recevra le ticket, par exemple `MIN-42`, et suit les tickets créés entre-temps ; son menu crée le ticket et copie cet identifiant.

Pour une création manuelle, désactivez Smart-fill si son bouton est affiché et activé. Les contrôles de priorité, d’effort, de catégories, d’objectif et de relations deviennent alors disponibles. Pour ne fixer que certaines de ces propriétés, laissez Smart-fill activé et ouvrez la flèche à côté de son bouton : choisissez une propriété, puis sa valeur. Hors du titre et de la description, la touche de la propriété ouvre directement son sélecteur : P pour la priorité, E pour l’effort, L pour les catégories ou O pour l’objectif. La valeur choisie reste affichée dans le formulaire. Smart-fill ne déduit que les propriétés laissées vides. Ce choix concerne ce ticket ; la réouverture du formulaire rétablit la préférence du compte. Il reste indépendant de Smart Assign et des routines. Tant que Smart-fill est activé, il [relie aussi le ticket aux tickets liés](#smart-fill-relations) une fois celui-ci enregistré : le sélecteur de relations est donc masqué ; R l’ouvre quand même. Les relations déjà choisies restent visibles au-dessus du titre et sont créées avec le ticket.

Définissez les propriétés utiles avant de confirmer : état, priorité, effort, responsable, objectif, catégories, échéance et récurrence. Le responsable est le propriétaire du projet ou un Membre, jamais un lecteur ; l’objectif regroupe des tickets autour d’un résultat du projet. Laissez une propriété optionnelle vide plutôt que de la deviner. La priorité est **Non définie** ou va de basse à urgente, en passant par moyenne et haute ; l’effort est **Non défini** ou utilise XS, S, M, L et XL.

Lorsque Smart Assign est activé dans le projet, le sélecteur de responsable affiche **Smart Assign** au lieu de **Non assigné**. Conservez ce choix : Smart Assign désigne le responsable dès que le ticket a quitté le triage. Dans le panneau du ticket, choisir **Smart Assign** retire le responsable actuel et laisse Smart Assign choisir à nouveau. Les tickets **Annulé** et **Doublon** conservent **Non assigné**.

Confirmez la création et ouvrez le ticket. Vérifiez son identifiant et son projet. Modifiez ses propriétés à mesure que la tâche se précise. La description explique le travail ; le plan d’implémentation est séparé, dans l’onglet Plan.

Fermer le formulaire conserve ce que vous avez écrit : rouvrez-le pour reprendre là où vous en étiez. Si vous ne le rouvrez pas dans les deux minutes, son contenu est enregistré comme brouillon et le formulaire suivant s’ouvre vide ; jusque-là, il n’existe que dans cette fenêtre, et recharger ou fermer la fenêtre le fait perdre. Ouvrir un brouillon ou un formulaire prérempli depuis un autre endroit enregistre d’abord ce que vous aviez laissé comme brouillon. Pour l’enregistrer vous-même, ouvrez le menu à côté du bouton de création et choisissez **Enregistrer en brouillon**. Les brouillons de tickets et d’objectifs enregistrés se retrouvent dans **Brouillons**, en bas à droite de la fenêtre, entre Numo et le carnet de tâches ; le bouton n’apparaît que si vous avez un brouillon et en indique le nombre. Sa liste donne le titre et la première ligne de description de chaque brouillon. Choisissez un brouillon pour le rouvrir dans son formulaire de création et le terminer ; créer le ticket supprime le brouillon. Le bouton de suppression à côté d’un brouillon demande d’abord une confirmation, et la suppression est irréversible. Sur un téléphone, ouvrez la palette de commandes et cherchez le titre du brouillon. Les brouillons sont conservés sur cet appareil pendant 30 jours, dix de chaque type au plus ; la liste ne montre que ceux des projets où vous pouvez encore créer des tickets.


![Brouillon de ticket non envoyé dans le projet Aurora, avec titre, description, propriétés manuelles et le bouton Créer AUR-21.](/documentation/fr/new-issue.png)

La description, les commentaires et la fenêtre de création utilisent le même éditeur que les pages du projet, sans les poignées de bloc. Tapez `/` pour insérer un titre, une liste, une tâche, une citation, un **Encadré**, un bloc de code, un **Dépliant** ou un séparateur, et `@` pour mentionner une personne, un ticket, un objectif ou une page. Le menu `@` propose aussi les ressources jointes à ce que vous rédigez : le ticket ou l’objectif pour sa description et son plan, un commentaire pour ses propres fichiers, ou une fenêtre de création pour les fichiers ajoutés. Une mention d’une ressource jointe ailleurs s’affiche **Indisponible**. Plusieurs personnes peuvent modifier la même description en même temps : le curseur de chacune s’affiche avec son nom et sa couleur, et les modifications de Numo ou d’un agent connecté apparaissent dès leur enregistrement. Numo, les agents connectés et les exports CSV lisent le texte en Markdown, qui suit quelques secondes après la fin de la saisie. Sélectionnez du texte pour le mettre en gras, en italique, barré ou en code, ou pour ajouter un lien. Collez ou déposez une image, ou choisissez **Image** dans le menu `/`, pour l’insérer dans la description ; les autres types de fichiers vont dans les ressources du ticket. Une mention désigne sa cible, et non son nom : elle suit un renommage et résiste aux modifications comme au copier-coller vers une autre description, un commentaire, une page ou le compositeur de Numo. Un lecteur qui ne peut pas ouvrir la cible voit une mention **Indisponible**, sans son nom ni son projet.

### Vérifier l’enregistrement et la visibilité {#issue-save}

Après une modification, vérifiez la valeur affichée. Un changement de responsable, d’état ou de catégorie peut retirer immédiatement le ticket de la vue filtrée. Recherchez son identifiant ou ouvrez le projet sans ces filtres avant de créer un remplacement.

Si la création ou la sauvegarde échoue, conservez votre texte, lisez l’erreur et vérifiez l’adhésion et la destination. Après un échec réseau, vérifiez d’abord si le ticket existe déjà. Liez une page comme ressource vivante lorsque son contenu actuel est nécessaire, et utilisez les commentaires pour la discussion de la tâche.

### Choisir ce que fait Smart-fill {#smart-fill-preferences}

Les préférences de Smart-fill appartiennent à votre compte. Ouvrez **Paramètres du compte** → **Smart Fill**. Chaque option a sa propre carte :

- Dans la carte **Smart Fill**, **Activer Smart Fill** active ou désactive Smart-fill pour votre compte. Il complète la priorité, l’effort, les catégories et l’objectif manquants ; l’état, le responsable et l’échéance restent les vôtres. Les interrupteurs des deux cartes suivantes en dépendent.
- Dans **Tickets à remplir**, **Remplir les tickets créés** et **Remplir les tickets en triage** choisissent les nouveaux tickets qu’il complète : ceux que vous créez, et les tickets en triage dont vous êtes responsable. **Réévaluer les tickets modifiés**, activé par défaut, permet à Smart-fill de [relire un ticket](#smart-fill-reevaluation) après une modification de son titre ou de sa description. **Rédiger les titres manquants**, activé par défaut, permet à Smart-fill de [rédiger le titre](#smart-fill-title) d’un ticket que vous vous contentez de décrire.
- Dans **Tickets liés**, **Relier les tickets liés**, activé par défaut, permet à Smart-fill d’[ajouter des relations](#smart-fill-relations) après l’enregistrement d’un ticket.
- Dans **Indexation des tickets**, **Indexer les tickets**, activé par défaut et indépendant de Smart-fill, transforme le titre et la description des tickets que vous créez ou modifiez en vecteurs privés qui servent à trouver les tickets liés et à [chercher des tickets par le sens](/docs/navigation#search-by-meaning). L’indexation en arrière-plan des tickets existants d’un projet suit à la fois l’interrupteur du propriétaire du projet et celui de l’auteur : un ticket dont l’auteur l’a désactivé n’est jamais indexé. Les vecteurs sont chiffrés avec le projet, comme le ticket ; ceux enregistrés avant que le projet ne soit chiffré sont convertis par la tâche d’arrière-plan. Interrupteur désactivé, aucun vecteur n’est créé pour vos tickets, même quand quelqu’un d’autre les modifie, et la recherche de tickets liés ne compare que les mots. Vos propres recherches n’utilisent alors que le texte, sans recherche par le sens. Les vecteurs déjà créés restent tant que le texte ne change pas ; ils sont supprimés dès que le texte change, ou avec le ticket.

Désactiver un interrupteur annule aussi les passes qui n’ont pas encore eu lieu. Numo peut modifier ces préférences à votre demande.

### Quand Smart-fill relit un ticket {#smart-fill-reevaluation}

Avec **Réévaluer les tickets modifiés** activé, un ticket créé avec Smart-fill actif est relu après une modification de son titre ou de sa description. Smart-fill attend que le texte n’ait plus changé pendant cinq minutes, si bien qu’une série de modifications n’est lue qu’une fois ; la passe peut démarrer jusqu’à une minute plus tard. Il redéfinit alors la priorité, l’effort, les catégories et l’objectif à partir du nouveau texte.

Il ne modifie que les propriétés que personne n’a choisies à la main : celles laissées vides à la création du ticket et que personne n’a changées depuis. Dès que vous, Numo ou un agent connecté en changez une, Smart-fill n’y touche plus. Il ne retire jamais l’objectif ni toutes les catégories ; il peut vider l’effort quand le texte ne décrit plus de travail estimable. Les tickets créés avant cette fonctionnalité, avec Smart-fill désactivé ou avec toutes leurs propriétés déjà définies ne sont jamais relus.

Chaque modification apparaît dans l’activité du ticket avec Smart-fill pour auteur, et un ticket déplacé vers un autre objectif apparaît aussi dans l’activité des deux objectifs. Une passe qui ne trouve rien à changer n’écrit rien. La passe compte dans la part **Automatisations** de la personne qui a fait la dernière modification, suit sa préférence **Réévaluer les tickets modifiés**, et n’a pas lieu si son budget est épuisé ou si le fournisseur échoue.

### Laisser Smart-fill rédiger le titre {#smart-fill-title}

Avec **Rédiger les titres manquants** activé, vous créez un ticket en le décrivant. L’option est activée par défaut et dépend de **Activer Smart Fill**. Tant que Smart-fill est actif pour le ticket, le formulaire de création n’affiche que la description, avec le curseur dedans. Décrivez le travail et créez le ticket. Pour rédiger le titre vous-même, ouvrez la flèche à côté du bouton Smart-fill et choisissez **Définir manuellement** → **Titre** : le champ du titre apparaît au-dessus de la description, et un titre que vous saisissez est conservé tel quel. Si vous laissez le champ vide et passez à autre chose, il disparaît de nouveau. Désactiver Smart-fill pour le ticket fait aussi revenir le titre. Cela concerne le formulaire de création ; Numo, le serveur MCP et l’import CSV rédigent leurs propres titres.

Smart-fill rédige un titre court qui résume la description et distingue le ticket des tickets semblables, dans la langue de la description. Le ticket apparaît une fois son titre et ses propriétés remplis, et son activité nomme Smart-fill. Si aucun titre ne peut être rédigé, parce que le fournisseur échoue ou que votre budget **Automatisations** est épuisé, le ticket prend la première ligne de sa description. Une description qui ne contient qu’une image demande toujours un titre.

Un titre rédigé ainsi reste celui de Smart-fill tant que personne ne le modifie. Avec **Réévaluer les tickets modifiés** activé, une [relecture](#smart-fill-reevaluation) ultérieure peut le remplacer quand la description décrit désormais un autre travail, et le garde tant qu’il convient. Cette passe ne réécrit le titre que si la personne qui a fait la dernière modification n’a pas désactivé **Rédiger les titres manquants**. Dès que vous, Numo ou un agent connecté modifiez le titre, Smart-fill n’y touche plus.

## Examiner le travail entrant dans le triage {#triage-incoming-work}

Ouvrez Triage dans le projet. Lisez le ticket et son contexte d’origine avant de l’accepter dans le travail planifié. Vérifiez si un ticket existant représente déjà cette demande. Précisez le résultat, le projet, le responsable, la priorité et l’effort si nécessaire.

Les filtres de la liste permettent de cibler les tickets entrants par priorité, effort, assigné, objectif, catégories ou intégration. **Non définie** sous la priorité et **Non défini** sous l’effort gardent les tickets qui n’ont pas encore de valeur. Les choix d’une même propriété sont des alternatives ; les différentes propriétés se cumulent. Réinitialisez les filtres pour retrouver tous les tickets entrants.

Choisissez Accepter et confirmez pour déplacer un ticket retenu vers le backlog. Choisissez Refuser et confirmez pour le passer à l’état annulé. Pour un doublon, sélectionnez le ticket à conserver dans le sélecteur de doublon : le ticket entrant prend l’état doublon et pointe vers celui-ci. Décrire la demande dans la recherche du sélecteur liste aussi des tickets proches sous **Liés par le sens**, après les correspondances textuelles ; voir [Chercher des tickets par le sens](/docs/navigation#search-by-meaning). L’entrée suivante est sélectionnée quand un ticket quitte le triage. Vérifiez l’état ou le lien de doublon dans le ticket lui-même. Passer d’une carte à l’autre sans effectuer ces actions ne clôture pas le ticket.

### Ordre et limites {#triage-order}

Smart Triage utilise des règles de classement déterministes.

Dans chaque colonne d’état :

- Les tickets ouverts qui bloquent du travail ouvert passent en premier, suivis des tickets sans blocage. Ceux bloqués par du travail ouvert passent en dernier, même s’ils en bloquent d’autres. Les extrémités clôturées n’influencent plus cette priorité.
- Dans un même niveau de blocage, une priorité élevée, un effort plus petit et une échéance dépassée ou proche font remonter le travail.
- Les tickets d’un même objectif restent groupés dans ce niveau, avec un ordre fondé sur le ticket le mieux classé du groupe.
- Les égalités sont départagées par l’échéance, l’ancienneté de création, la position manuelle et enfin l’identifiant.

Une relation associée ne modifie pas ce classement. Smart Triage n’est pas un mode IA expérimental : son classement aide à choisir quoi examiner d’abord, mais ne valide pas les descriptions, ne résout pas les doublons et n’accorde aucune permission.

Si une entrée manque, vérifiez projet, état et filtres, puis recherchez son identifiant. Du travail importé ou synchronisé peut arriver dans le triage ; inspectez sa source et la correspondance de l’intégration avant de modifier des champs répliqués. Une demande liée depuis les retours reste un objet feedback distinct, avec sa discussion publique.


![Ticket de démonstration AUR-19 reçu dans le triage, avec son signalement, ses propriétés et les commandes Doublon, Refuser et Accepter.](/documentation/fr/triage-incoming.png)

## Faire évoluer l’état d’un ticket {#issue-statuses}

Ouvrez le sélecteur d’état du ticket ou les actions d’état du tableau. En kanban, déplacer une carte entre colonnes modifie le ticket ; changer un filtre modifie seulement l’affichage. Vérifiez le nouvel état dans le panneau de détail.

| État | Usage |
| --- | --- |
| Triage | Travail entrant à examiner. |
| Backlog | Travail retenu, pas encore choisi pour démarrer. |
| À faire | Travail sélectionné à effectuer. |
| En cours | Travail commencé. |
| En revue | Implémentation en attente de relecture. |
| Terminé | Résultat attendu accompli. |
| Annulé | Travail clôturé sans livraison. |
| Doublon | Travail représenté par un autre ticket. |

Les états sont fixes et ne se personnalisent pas par projet. Triage et doublon existent dans les sélecteurs, mais sont volontairement absents des colonnes kanban ordinaires. Par défaut, les tableaux masquent aussi les colonnes **Terminé** et **Annulé** ; sélectionnez-les dans le filtre **Statut** pour les afficher. Une colonne absente ne signifie pas que l’état ou le ticket n’existe pas.


![Les huit statuts du ticket dans le sélecteur, avec Backlog sélectionné.](/documentation/fr/issue-statuses.png)

### États terminaux et vérification {#closed-work}

Terminé, annulé et doublon sont terminaux pour le suivi : ils ne bloquent plus leurs dépendants et sortent des comptes actifs. Annulé ne signifie pas livré. Pour un doublon, indiquez le ticket conservé afin de donner une destination claire aux discussions et au progrès.

Vérifiez les filtres si un ticket disparaît après clôture. Ouvrez-le par identifiant pour inspecter le résultat et corriger une clôture accidentelle. Pour un travail bloqué, contrôlez aussi le sens de la dépendance : un changement d’état ne réécrit ni description ni plan.

## Discuter du travail et joindre son contexte {#issue-discussion-and-resources}

Ouvrez le fil du ticket pour ajouter un commentaire. Expliquez une décision, posez une question ou décrivez un résultat de vérification pour qu’un autre membre comprenne le changement. Les mentions ajoutent une personne ou un objet au contexte ; les notifications dépendent toujours des préférences et de la livraison sur ses appareils. Un lecteur ne peut commenter que si le propriétaire a activé **Peut commenter** pour lui. Il peut alors répondre, mentionner des personnes, joindre des fichiers à ses propres commentaires, et modifier ou supprimer ses propres commentaires.

Joignez une page du projet, un fichier ou un lien depuis les ressources. Une page liée est une ressource vivante : son titre suit les renommages et son contenu évolue. Un fichier est une pièce jointe stockée, pas la garantie qu’une URL externe restera disponible. Pour rédiger une page qui n’existe pas encore, choisissez **Page**, puis **Nouvelle page** en bas de la liste ; un titre tapé d’abord dans la recherche devient son titre. La page est créée dans le projet, jointe au ticket et ouverte dans un panneau latéral, où **Agrandir** ouvre la page entière.

Les ressources s’affichent en cartes : l’image elle-même ou l’icône du type de fichier, le nom et le poids. Un lien affiche l’image d’aperçu de sa page quand le site en fournit une, sinon son favicon. Cliquez ou faites un clic droit sur une carte pour ouvrir son menu : Aperçu, Ouvrir le lien ou Ouvrir la page, puis Renommer, Télécharger et Retirer quand ils s’appliquent. Aperçu ouvre un fichier pris en charge sur toute la fenêtre. Images, PDF, Markdown (`.md`), texte brut (`.txt`, `.text`), CSV et formats audio ou vidéo compatibles utilisent le même lecteur. Le Markdown est mis en forme, le texte reste littéral et le CSV s’ouvre dans un tableau défilant. Utilisez Fermer ou Échap pour revenir au ticket. Le menu Actions du fichier (`…`) propose Télécharger et, si vous pouvez modifier cette ressource, Renommer et Retirer. Un clic sur la mention d’un fichier dans un texte ouvre le même lecteur. Minddy demande une confirmation avant de retirer une ressource, qui est alors détachée de ce contexte. Une ressource page garde le titre de sa page et ne se renomme pas. Les formats non pris en charge conservent leur action de téléchargement. **Ouvrir la page** l’affiche dans un panneau latéral, où **Agrandir** ouvre la page entière ; une base de données s’ouvre directement en page entière.

![Lecteur CSV sur toute la fenêtre avec des tâches de projet d’exemple, un grand bouton Fermer et le menu Actions du fichier proposant Télécharger, Renommer et Retirer.](/documentation/fr/file-preview.png)

![Dialogue d’ajout de lien avec une adresse de contact d’exemple.](/documentation/fr/work-resources.png)

### Visibilité et envoi échoué {#resource-access}

L’accès au projet et au ticket contrôle les discussions et ressources internes. Ajouter une ressource ne la publie pas anonymement. Dans un parcours feedback, distinguez discussion d’équipe et réponse publique avant d’envoyer le texte.

Après envoi, vérifiez que la ressource apparaît et s’ouvre. En cas d’échec, gardez le fichier original, lisez l’erreur et vérifiez la taille ou le quota de stockage applicable. En auto-hébergement, les métadonnées Storage, les règles d’accès et les fichiers doivent aussi fonctionner. Ne joignez pas d’identifiants ni de diagnostics privés non nettoyés.

## Lier dépendances et tickets associés {#issue-dependencies}

Ouvrez les relations du ticket et recherchez l’autre par titre ou identifiant. Hors d’un champ de texte, R ouvre le choix du type de relation depuis une carte survolée ou le panneau du ticket. Une requête descriptive liste aussi, après les correspondances textuelles, des tickets du même projet trouvés [par le sens](/docs/navigation#search-by-meaning) sous **Liés par le sens**. Choisissez une relation de blocage lorsqu’une tâche doit finir avant qu’une autre puisse avancer. Si A bloque B, A est le préalable et B est bloqué par A. Une relation associée ajoute du contexte sans imposer cet ordre.

Lisez les deux identifiants et le sens affiché avant de confirmer. Par exemple, « Préparer le point d’accès » bloque « Connecter le client », pas l’inverse. Une dépendance ne transforme pas un ticket en sous-ticket, et la relation parent-enfant ne remplace pas un blocage.

![Recherche d’un préalable par identifiant de ticket.](/documentation/fr/work-dependencies.png)

### Blocages résolus ou hérités {#blocker-state}

Les états terminaux terminé, annulé et doublon cessent de bloquer le travail. Une relation relie des tickets ou objectifs du même projet ; ses deux extrémités doivent y être accessibles. Elle ne relie pas arbitrairement du travail privé de plusieurs projets et ne publie aucun des objets.

Un ticket ouvert peut hériter d’un blocage par son objectif ouvert. Si A bloque l’objectif B, les tickets ouverts rattachés à B affichent A comme blocage hérité, sans relation directe entre A et chaque ticket. L’affichage nomme le vrai blocage et l’objectif à l’origine de l’héritage. Inspectez cette relation d’objectif avant de chercher à la dissocier du ticket. Clôturer A, clôturer B ou retirer le ticket de B supprime ce blocage hérité. Le mécanisme suit l’appartenance à l’objectif, pas la hiérarchie parent/sous-ticket.

Retirez une relation devenue inexacte depuis ses commandes ; une confirmation nomme l’autre ticket ou objectif, et seul le lien disparaît. Vérifiez ensuite son libellé et l’indicateur de blocage. Marquer un doublon modifie son cycle de vie et désigne le travail conservé ; une simple relation associée ne clôture pas le doublon.

Si le sélecteur ne trouve pas un ticket, vérifiez son identifiant et l’accès au projet. Ne révélez pas un autre projet en copiant son lien privé dans une réponse publique à un retour.

### Liens ajoutés par Smart-fill {#smart-fill-relations}

Lorsque **Relier les tickets liés** est activé, Smart-fill cherche les tickets liés après la création d’un ticket ou la modification de son titre ou de sa description. Ce travail se fait en arrière-plan après l’enregistrement : la création et la modification ne l’attendent jamais, et les liens peuvent apparaître quelques secondes plus tard. Pour un nouveau ticket, il suit les mêmes choix que les autres champs : il ne s’exécute donc pas si vous avez désactivé Smart-fill pour ce ticket. Il ne s’exécute pas pour les tickets importés d’un dépôt lié, pour les copies récurrentes ni pour les modifications synchronisées depuis le dépôt.

Smart-fill compare le ticket à cinq candidats au plus du même projet, en écartant les tickets annulés, en doublon ou supprimés. Une décision classe ensuite chaque candidat : lié, bloque, bloqué par ou aucune relation. La similarité seule ne crée jamais de lien, une dépendance exige des indices plus forts qu’un simple lien, et Smart-fill n’ajoute rien en cas de doute. Un lien exige un rapport évident, comme le même bug, une suite directe ou un retour en arrière : deux tickets qui partagent seulement une fonctionnalité ou un sujet restent sans lien. La plupart des tickets ne reçoivent donc aucun lien. Une même passe ajoute au plus deux relations. Elle ne touche jamais une paire qui a déjà une relation, n’ajoute jamais un blocage qui fermerait un cycle, et abandonne son résultat si le texte du ticket a changé pendant la décision. Elle ne marque jamais un doublon et ne change jamais un état.

Les liens ajoutés ainsi apparaissent dans les relations du ticket comme les autres, et l’historique indique Smart-fill comme auteur. Vérifiez le sens d’une dépendance comme pour les vôtres. Pour retirer un lien, utilisez les commandes de relations : Smart-fill ne rajoute pas un lien retiré pour cette paire. Pour ne plus recevoir de nouveaux liens, désactivez **Relier les tickets liés** dans [vos préférences](#smart-fill-preferences). Les tickets créés avant cette fonctionnalité, les tickets importés et ceux synchronisés depuis un dépôt sont indexés progressivement en arrière-plan, mais ne reçoivent jamais de liens automatiques.

L’indexation et les décisions de relation utilisent l’IA. Elles comptent dans la part **Automatisations** du compte à qui revient la passe : le compte facturé pour le Smart-fill du nouveau ticket, en général son créateur ; l’auteur de la modification pour une modification ; le propriétaire du projet pour l’indexation en arrière-plan. L’historique d’usage affiche l’indexation sous **Smart-fill · index des tickets**. Une décision de relation apparaît sous **Décision IA** quand le modèle de décision la tranche, et sous **Smart-fill · relations** quand c’est le modèle de secours. Si ce budget est épuisé ou si le fournisseur échoue, la passe est ignorée et le ticket reste inchangé. [La recherche de tickets par le sens](/docs/navigation#search-by-meaning) utilise le même index : chaque nouvelle requête compte dans la part **Automatisations** du compte qui cherche et apparaît sous **Recherche de tickets**.

## Découper un ticket en sous-tickets {#sub-issues}

Ouvrez le ticket parent et ses commandes de sous-tickets pour créer les parties du travail. Donnez à chaque enfant un résultat distinct. Après création, vérifiez projet, propriétés et identifiant du parent. La hiérarchie facilite le suivi ; elle ne remplace pas la description du résultat de chaque tâche.

Pour rattacher des tickets existants, appuyez sur R sur une carte survolée ou dans le panneau du ticket, ou ouvrez **Relations** depuis le clic droit d’une carte. **Parent de** liste les tickets qui peuvent devenir un sous-ticket de celui-ci ; **Sous-ticket de** liste les tickets de premier niveau qui peuvent devenir son parent. Chaque liste ne propose que ce que permet la règle d’un seul niveau : un sous-ticket n’a pas d’entrée **Parent de**, et un ticket qui a déjà des sous-tickets n’a pas d’entrée **Sous-ticket de**. Choisir un ticket qui a déjà un autre parent le déplace sous le nouveau. Depuis une sélection de cartes, **Sous-ticket de** place chaque ticket sélectionné éligible sous le parent choisi.

La hiérarchie accepte un seul niveau : le parent doit être un ticket de premier niveau du même projet et un sous-ticket ne peut pas avoir ses propres enfants. Sans objectif explicitement choisi à la création, l’enfant hérite de celui du parent ; vérifiez les propriétés obtenues plutôt que de supposer que les modifications ultérieures du parent se propagent.

Un enfant reste un ticket avec son état et sa discussion. L’indicateur de progrès du parent est pondéré par l’effort des enfants et le crédit de progression de leurs états. Le compteur terminé/total de la liste des sous-tickets est un décompte brut distinct. Lisez les états des enfants avec ces deux mesures. Utilisez une dépendance pour « doit finir avant » et un parent pour « fait partie de cette tâche plus large ».

![Champ de création d’un sous-ticket dans un parent de démonstration.](/documentation/fr/work-sub-issues.png)

### Ouvrir ou retirer le parent {#change-parent}

L’identifiant du parent à côté du titre ouvre un menu. Son action d’ouverture permet d’inspecter la tâche globale. Pour détacher l’enfant, choisissez l’action de dissociation du parent, puis lisez la confirmation. Une dissociation réussie retire la relation tout en conservant le ticket.

Ne supprimez pas un enfant pour réorganiser la hiérarchie. Vérifiez les relations existantes avant de changer de parent et résolvez une relation refusée plutôt que de forcer une boucle. Après un échec de sauvegarde, rouvrez l’enfant pour vérifier si le changement a été appliqué avant de réessayer. Conservez le travail enfant terminé lors d’une révision du plan global.

## Maintenir un plan d’implémentation {#implementation-plans}

Ouvrez l’onglet Plan du ticket. La description doit déjà préciser problème et résultat attendu. Ajoutez les étapes manuellement, ou [copiez le prompt **Générer un plan**](#copy-issue-prompt) pour votre propre agent de code, qui explore lui-même le dépôt. Numo ne peut pas lire le dépôt : il peut préciser la description et, si vous le demandez, rédiger un plan simple, mais tout chemin de fichier ou toute fonction qu’il cite est une supposition. Un chemin ou une fonction dans un plan ne constitue une preuve que si le dépôt a réellement été lu.

Le plan se modifie sur place, comme la description : cliquez dedans et écrivez, sans mode d’édition ni bouton d’enregistrement. Un plan vide affiche un texte d’invite. Plusieurs membres, Numo et les agents connectés peuvent modifier le même plan en même temps, chacun avec un curseur nommé, et une tâche cochée par un agent apparaît dans votre éditeur pendant que vous écrivez ailleurs. Tapez `- [ ]` suivi d’une espace en début de ligne, ou choisissez **Liste de tâches** dans le menu `/`, pour ajouter une tâche. Cliquez sur la case d’une tâche pour la terminer, ou ouvrez son menu pour les autres états.

Appuyez sur Tab dans une tâche pour l’imbriquer sous la précédente, et sur Maj+Tab pour la remonter ; dans le Markdown enregistré, chaque niveau est indenté de deux espaces. Cette imbrication organise les étapes du plan, sans créer de relation parent-enfant entre tickets. Chaque tâche de travail non annulée contribue à la progression, y compris les tâches imbriquées.

Le plan utilise des lignes de tâches Markdown : `- [ ]` pour une tâche en attente, `- [~]` pour une tâche en cours, `- [x]` pour une tâche terminée et `- [-]` pour une tâche annulée. Placez le texte après le marqueur, par exemple `- [ ] Vérifier le lien de contact sur mobile`. Les tâches annulées ne comptent pas dans la progression. Les tâches sous un titre Questions reconnu sont traitées comme des questions et sont aussi exclues du calcul ; placez donc le travail dans une autre section de même niveau de titre. L’éditeur affiche ces lignes comme des tâches et les réécrit dans le même format, celui que lisent Numo et les agents connectés. Utilisez les états en attente, en cours, terminé et annulé pour refléter ce qui s’est passé, sans suggérer une vérification qui n’a pas été exécutée.

![Plan de démonstration avec deux tâches de travail terminées sur six.](/documentation/fr/work-implementation-plan.png)

### Conserver le progrès et les changements concurrents {#plan-progress}

Complétez ou corrigez le plan existant plutôt que de le remplacer par une nouvelle copie décochée. Gardez les étapes terminées et les raisons des changements de périmètre. Les modifications des autres membres et des agents apparaissent dans le plan au moment où elles sont faites. Un outil qui remplace le plan entier remplace tout de même les passages qu’il réécrit : demandez aux agents de ne modifier que la partie qu’ils changent.

Pour faire implémenter le plan, copiez le prompt du ticket pour votre propre agent de code, comme décrit ci-dessous. Une étape cochée ne prouve pas à elle seule que le code passe les tests. Lisez résultat, modifications et contrôles avant de terminer le ticket.

### Copier un prompt pour un autre agent de code {#copy-issue-prompt}

Pour confier un ticket à un agent de code hors de Minddy, comme Claude Code, Codex ou Cursor, ouvrez le menu d'actions du ticket, choisissez **Copier le prompt**, puis **Générer un plan** (ou **Vérifier le plan** s'il existe), **Implémenter le ticket**, **Vérifier l'implémentation** ou **Personnalisé…**. Avec plusieurs tickets sélectionnés, **Copier le prompt combiné** les réunit dans un seul prompt. La copie n'exécute aucun modèle d'IA et ne consomme pas votre quota d'IA : Minddy assemble ce qu'il connaît déjà, et l'agent explore lui-même le dépôt. Si **Démarrer le ticket ou la tâche quand je copie son prompt** est activé dans les préférences du compte, la copie démarre aussi un ticket qui n'a pas encore commencé. Consultez [Travail de code et pull requests](/docs/code-work) pour le parcours complet et la relecture des pull requests.

Le prompt contient les champs du ticket, ses catégories, ses relations, le nombre de ressources jointes et l'avancement du plan, mais pas le texte du plan, que l'agent lit par le serveur MCP de Minddy ou vous demande. Il indique aussi le dépôt lié au projet et chaque pull request liée au ticket, avec son état et ses branches lorsqu'ils sont connus. L'agent poursuit une pull request ouverte sur sa branche et traite celles qui sont fusionnées ou fermées comme de l'historique. Sans pull request ouverte, le prompt suggère un nom de branche formé de l'identifiant du ticket et d'un titre court, par exemple `min-42-keyboard-navigation`. Ce n'est qu'une suggestion : l'agent vérifie d'abord les branches existantes et suit la convention de nommage du dépôt. Garder l'identifiant dans le nom de branche, le titre de la pull request ou une ligne `Fixes MIN-42` permet à Minddy de rattacher la pull request au ticket lorsque le dépôt est lié.

Si les informations de pull request ne peuvent pas être chargées, le prompt le dit au lieu d'affirmer qu'il n'y en a aucune. Les prompts de plan et de vérification du plan demandent à l'agent de s'arrêter avant d'implémenter. Un prompt personnalisé garde votre demande et sa portée telles que vous les avez écrites. Le contenu du ticket et votre demande gardent leur langue d'origine ; les consignes qui les entourent sont en anglais.

## Répéter un ticket après sa réalisation {#recurring-issues}

Créez ou ouvrez un ticket utile à chaque occurrence, comme une vérification périodique des dépendances. Fixez une échéance, puis choisissez une récurrence quotidienne, hebdomadaire, mensuelle ou annuelle dans le contrôle de date du ticket. Une récurrence sans échéance est refusée. Examinez propriétés et responsable avant d’enregistrer. Les réglages de récurrence du projet présentent les séries actives ; ils permettent de modifier leur rythme ou d’arrêter la répétition.

Un ticket récurrent se recrée lorsqu’il est terminé ; le suivant arrive dans le backlog. Après réalisation, vérifiez l’identifiant et les propriétés du ticket suivant.

L’échéance suivante reprend l’échéance précédente augmentée d’une période, pas le jour de réalisation. Le nouveau ticket reprend titre, description, priorité, effort, responsable, objectif et catégories. Il ne copie ni plan d’implémentation, ni parent, ni ressources, ni commentaires. La récurrence passe au ticket suivant ; rouvrir et terminer de nouveau l’ancien ne crée pas une autre occurrence. Si la création suivante échoue, la série s’arrête plutôt que de réessayer en boucle sur le ticket terminé. Examinez le résultat et configurez la récurrence sur la prochaine tâche appropriée après résolution de l’échec. Une récurrence calendaire ne signifie pas qu’un code sera exécuté ou que le nouveau ticket sera accompli automatiquement.


![Sélecteur d’échéance en mode récurrent avec aperçu hebdomadaire le dimanche et heure optionnelle.](/documentation/fr/issue-date-recurrence.png)

### Modifier ou arrêter {#recurrence-change}

Modifiez ou désactivez la répétition future dans les réglages de récurrence. Inspectez séparément les tickets déjà créés : arrêter les prochaines créations ne les termine ni ne les supprime.

Une routine Numo est différente : elle planifie une conversation et peut consommer le budget IA du propriétaire et utiliser ses fournisseurs configurés. Choisissez la récurrence pour une tâche suivie qui se répète, et une routine pour une instruction à exécuter selon un calendrier. Si le ticket suivant manque, vérifiez que le précédent est terminé, que la récurrence est active et que les filtres n’excluent pas le backlog.

## Modifier plusieurs tickets ensemble {#bulk-issue-actions}

Dans un tableau, maintenez Maj et cliquez sur chaque carte pour l’ajouter à la sélection ou l’en retirer. Avec une souris, vous pouvez aussi tracer un rectangle depuis une zone vide du tableau ; Maj, Commande ou Ctrl ajoute cette zone à la sélection existante. Le rectangle n’est pas un mode de sélection tactile. Vérifiez le nombre choisi et les identifiants visibles avant d’ouvrir les actions groupées. La sélection est l’ensemble ciblé par l’action, pas une vue enregistrée ni une autorisation supplémentaire. Ouvrez-les avec **Actions** dans la barre de sélection, ou appuyez sur Commande+K sur macOS ou Ctrl+K sur Windows/Linux pendant que des tickets sont sélectionnés.

Choisissez Actions dans la barre flottante de sélection pour ouvrir la palette de commandes. Choisissez l’état, la priorité, l’effort ou le responsable, définissez la valeur et validez le formulaire intégré. L’action sur l’objectif apparaît seulement pour une sélection appartenant à un projet avec des objectifs disponibles. Les autres actions, comme ajouter ou retirer des tickets du cycle, lier deux tickets ou confier la sélection à Numo, apparaissent selon les capacités du tableau courant. À la souris, vous pouvez aussi pointer une carte sélectionnée et appuyer sur S, P, E, A, L, D, O ou R : le sélecteur qui s’ouvre s’applique à toute la sélection, et pour le responsable, l’objectif, les catégories et les relations aux tickets sélectionnés du projet de cette carte. Inspectez ensuite les tickets concernés. Sur un appareil uniquement tactile sans geste de sélection multiple pris en charge, modifiez les tickets un par un dans leur panneau de détail.

### Résultats partiels et suppression {#bulk-results}

Pour plusieurs projets, vérifiez votre adhésion à chacun. Lisez les échecs partiels : certaines modifications peuvent déjà être enregistrées alors qu’un autre ticket a été refusé. Inspectez le résultat avant de réessayer toute la sélection.

La suppression touche chaque élément sélectionné ; confirmez donc l’ensemble avant de poursuivre. **Déplacer les tickets vers la corbeille** demande une confirmation ; les tickets, avec leurs commentaires, fichiers et liens, peuvent être restaurés depuis la [corbeille](/docs/trash-and-recovery) pendant 30 jours. Effacez la sélection avant de passer à un autre travail. Un changement peut retirer des tickets de la vue filtrée sans les supprimer du projet. Recherchez leurs identifiants pour vérifier l’état obtenu plutôt que de les recréer.

## Importer un backlog CSV après contrôle {#import-issues}

Le propriétaire ouvre Import dans les réglages du projet et choisit un export CSV. Les formats de Linear et Jira sont détectés ; les autres CSV utilisent une correspondance générique. Chaque import est limité à 5 MiB et 5 000 tickets. Découpez un export plus grand de manière organisée et conservez, lorsque possible, les références aux parents dans le même lot.

Associez la colonne du titre avant d’importer. Examinez les correspondances de description, état, priorité, effort, échéance, catégories et responsables. Associez les personnes à des membres réels du projet et vérifiez les nouvelles catégories. Les références aux parents correspondent aux clés externes du lot et prennent en charge un seul niveau. Les CSV n’importent pas les octets des fichiers joints.

Une proposition IA n’est demandée que pour les correspondances manquantes. Elle reste modifiable ; un fournisseur indisponible ou en échec laisse utilisable la correspondance manuelle. Une correction manuelle empêche une proposition tardive d’écraser vos choix.

### Importer et contrôler {#result}

Après chaque modification des correspondances, lisez le nombre de tickets, la répartition des états et les avertissements. Corrigez les lignes ignorées ou invalides avant de confirmer. L’import crée de nouveaux tickets ; ne supposez pas que renvoyer le fichier effectue une mise à jour qui élimine les doublons. Après réussite, vérifiez des tickets représentatifs, leurs responsables, leurs dates et leurs parents. Si la réponse est perdue, examinez le projet avant de renvoyer le fichier entier pour éviter le travail en double.

![Aperçu CSV de deux lignes de démonstration localisées et des colonnes détectées.](/documentation/fr/import-issues-preview-workflow.png)

## Exporter les tickets en CSV {#export-issues}

En tant que membre connecté d’un projet, ouvrez la palette avec Command+K sur macOS ou Ctrl+K ailleurs et recherchez « Exporter les tickets en CSV ». Choisissez cette commande, sélectionnez un projet ou tous les projets accessibles, puis vérifiez les cases de statut. La page du projet courant présélectionne ce projet. Les tickets terminés, annulés et en doublon sont exclus par défaut ; incluez-les pour récupérer l’historique complet. Gardez au moins un statut coché. Les filtres du tableau et les cartes sélectionnées ne déterminent pas cet export.

Choisissez Exporter et vérifiez la confirmation du téléchargement et le nombre de tickets annoncé. Le CSV UTF-8 contient les identifiants, titres, descriptions Markdown, statuts, priorités, efforts, catégories, responsables, objectifs, noms de projets, dates et identifiants parents. Seuls vos projets accessibles sont concernés. Un fichier contenant seulement les en-têtes peut signifier qu’aucun ticket accessible ne correspond. Les descriptions et les noms téléchargés restent des données de projet à prendre en compte lors du partage.

### Vérifier l’exhaustivité et réimporter {#export-issues-limits}

L’export est limité à 20 000 tickets. Un avertissement de troncature indique que le fichier peut être incomplet ; réduisez le périmètre par projet et statut, exportez des groupes séparés et comparez les nombres. Répéter le même export ne récupère pas une page suivante. Si le téléchargement échoue, vérifiez l’erreur, votre session et vos accès avant de réessayer.

Ce format peut être [importé dans minddy](#import-issues), avec l’autorisation du propriétaire de destination et après vérification du mappage. L’import crée de nouveaux tickets ; il ne restaure pas les identifiants d’origine et ne met pas à jour les tickets existants. Conservez les parents dans le même lot d’import. Le CSV transporte des données de tickets, pas une sauvegarde des pièces jointes, commentaires, paramètres du compte ou identifiants d’accès. Pour transférer un compte, suivez le [guide de transfert entre instances](/docs/transfer-between-instances).
