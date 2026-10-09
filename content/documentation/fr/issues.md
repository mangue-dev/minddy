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
    "A06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); 0.11.1 candidate (cd1843e12)",
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
      "captures/shots/relations/intent.md",
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
      "content/documentation/reviews/csv-preview-capture-candidates.json",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
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
      "alt": "Brouillon de ticket non envoyé avec titre, description et propriétés manuelles.",
      "caption": "Décrivez le résultat attendu, puis choisissez les propriétés utiles avant de créer le ticket.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        720,
        330
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/triage-incoming.png",
      "alt": "Ticket de démonstration DOC-11 reçu dans le triage, avec son signalement, ses propriétés et les commandes Doublon, Refuser et Accepter.",
      "caption": "Lisez le signalement reçu avant de l’accepter, de le refuser ou de le relier à un doublon.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        994,
        866
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/issue-statuses.png",
      "alt": "Les huit statuts du ticket dans le sélecteur, avec Backlog sélectionné.",
      "caption": "La coche indique le statut actuel. Choisissez celui qui reflète l’état réel du travail.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        288,
        357
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        368,
        152
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        508,
        1096
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        324,
        544
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "bulk-issue-actions-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/work-bulk-actions.png",
      "alt": "Menu d’actions pour deux tickets de démonstration sélectionnés.",
      "caption": "Le menu agit sur les tickets sélectionnés. Aucune modification groupée n’a été envoyée sur cette capture.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        788,
        506
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
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        977
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
    "bulk-issue-actions-steps",
    "import-issues-workflow"
  ]
}
---

Un ticket suit un travail dans un projet, de son signalement à sa clôture. Commencez par la création, le triage et les états, ou consultez les sections sur les discussions, les dépendances, les sous-tickets et les plans pour un travail déjà engagé. Les récurrences, les actions groupées et l’import CSV demandent des vérifications spécifiques avant application.

## Créer et modifier un ticket {#create-an-issue}

Vous devez être membre du projet destinataire. Ouvrez le projet et sa commande de création de ticket. Saisissez un titre qui nomme le travail, puis décrivez contexte, résultat attendu et contraintes. Depuis une vue personnelle ou transversale, choisissez explicitement le projet.

Pour une création manuelle, désactivez Smart-fill si son bouton est affiché et activé. Les contrôles de priorité, d’effort, de catégories et d’objectif deviennent alors disponibles. Ce choix concerne ce ticket ; la réouverture du formulaire rétablit la préférence du compte. Il reste indépendant des réglages d’automatisation et de Smart Assign du projet.

Définissez les propriétés utiles avant de confirmer : état, priorité, effort, responsable, objectif, catégories, échéance et récurrence. Le responsable est un membre du projet ; l’objectif regroupe des tickets autour d’un résultat du projet. Laissez une propriété optionnelle vide plutôt que de la deviner. La priorité va d’aucune à urgente, avec basse, moyenne et haute ; l’effort utilise XS, S, M, L et XL.

Confirmez la création et ouvrez le ticket. Vérifiez son identifiant et son projet. Modifiez ses propriétés à mesure que la tâche se précise. La description explique le travail ; le plan d’implémentation est séparé, dans l’onglet Plan.


![Brouillon de ticket non envoyé avec titre, description et propriétés manuelles.](/documentation/fr/new-issue.png)

### Vérifier l’enregistrement et la visibilité {#issue-save}

Après une modification, vérifiez la valeur affichée. Un changement de responsable, d’état ou de catégorie peut retirer immédiatement le ticket de la vue filtrée. Recherchez son identifiant ou ouvrez le projet sans ces filtres avant de créer un remplacement.

Si la création ou la sauvegarde échoue, conservez votre texte, lisez l’erreur et vérifiez l’adhésion et la destination. Après un échec réseau, vérifiez d’abord si le ticket existe déjà. Liez une page comme ressource vivante lorsque son contenu actuel est nécessaire, et utilisez les commentaires pour la discussion de la tâche.

## Examiner le travail entrant dans le triage {#triage-incoming-work}

Ouvrez Triage dans le projet. Lisez le ticket et son contexte d’origine avant de l’accepter dans le travail planifié. Vérifiez si un ticket existant représente déjà cette demande. Précisez le résultat, le projet, le responsable, la priorité et l’effort si nécessaire.

Choisissez Accepter et confirmez pour déplacer un ticket retenu vers le backlog. Choisissez Refuser et confirmez pour le passer à l’état annulé. Pour un doublon, sélectionnez le ticket à conserver dans le sélecteur de doublon : le ticket entrant prend l’état doublon et pointe vers celui-ci. L’entrée suivante est sélectionnée quand un ticket quitte le triage. Vérifiez l’état ou le lien de doublon dans le ticket lui-même. Passer d’une carte à l’autre sans effectuer ces actions ne clôture pas le ticket.

### Ordre et limites {#triage-order}

Smart Triage utilise des règles de classement déterministes.

Dans chaque colonne d’état :

- Les tickets ouverts qui bloquent du travail ouvert passent en premier, suivis des tickets sans blocage. Ceux bloqués par du travail ouvert passent en dernier, même s’ils en bloquent d’autres. Les extrémités clôturées n’influencent plus cette priorité.
- Dans un même niveau de blocage, une priorité élevée, un effort plus petit et une échéance dépassée ou proche font remonter le travail.
- Les tickets d’un même objectif restent groupés dans ce niveau, avec un ordre fondé sur le ticket le mieux classé du groupe.
- Les égalités sont départagées par l’échéance, l’ancienneté de création, la position manuelle et enfin l’identifiant.

Une relation associée ne modifie pas ce classement. Smart Triage n’est pas un mode IA expérimental : son classement aide à choisir quoi examiner d’abord, mais ne valide pas les descriptions, ne résout pas les doublons et n’accorde aucune permission.

Si une entrée manque, vérifiez projet, état et filtres, puis recherchez son identifiant. Du travail importé ou synchronisé peut arriver dans le triage ; inspectez sa source et la correspondance de l’intégration avant de modifier des champs répliqués. Une demande liée depuis les retours reste un objet feedback distinct, avec sa discussion publique.


![Ticket de démonstration DOC-11 reçu dans le triage, avec son signalement, ses propriétés et les commandes Doublon, Refuser et Accepter.](/documentation/fr/triage-incoming.png)

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

Les états sont fixes et ne se personnalisent pas par projet. Triage et doublon existent dans les sélecteurs, mais sont volontairement absents des colonnes kanban ordinaires. Une colonne absente ne signifie pas que l’état ou le ticket n’existe pas.


![Les huit statuts du ticket dans le sélecteur, avec Backlog sélectionné.](/documentation/fr/issue-statuses.png)

### États terminaux et vérification {#closed-work}

Terminé, annulé et doublon sont terminaux pour le suivi : ils ne bloquent plus leurs dépendants et sortent des comptes actifs. Annulé ne signifie pas livré. Pour un doublon, indiquez le ticket conservé afin de donner une destination claire aux discussions et au progrès.

Vérifiez les filtres si un ticket disparaît après clôture. Ouvrez-le par identifiant pour inspecter le résultat et corriger une clôture accidentelle. Pour un travail bloqué, contrôlez aussi le sens de la dépendance : un changement d’état ne réécrit ni description ni plan.

## Discuter du travail et joindre son contexte {#issue-discussion-and-resources}

Ouvrez le fil du ticket pour ajouter un commentaire. Expliquez une décision, posez une question ou décrivez un résultat de vérification pour qu’un autre membre comprenne le changement. Les mentions ajoutent une personne ou un objet au contexte ; les notifications dépendent toujours des préférences et de la livraison sur ses appareils.

Joignez une page du projet, un fichier ou un lien depuis les ressources. Une page liée est une ressource vivante : son titre suit les renommages et son contenu évolue. Un fichier est une pièce jointe stockée, pas la garantie qu’une URL externe restera disponible.

![Dialogue d’ajout de lien avec une adresse de contact d’exemple.](/documentation/fr/work-resources.png)

### Visibilité et envoi échoué {#resource-access}

L’accès au projet et au ticket contrôle les discussions et ressources internes. Ajouter une ressource ne la publie pas anonymement. Dans un parcours feedback, distinguez discussion d’équipe et réponse publique avant d’envoyer le texte.

Après envoi, vérifiez que la ressource apparaît et s’ouvre. En cas d’échec, gardez le fichier original, lisez l’erreur et vérifiez la taille ou le quota de stockage applicable. En auto-hébergement, les métadonnées Storage, les règles d’accès et les fichiers doivent aussi fonctionner. Ne joignez pas d’identifiants ni de diagnostics privés non nettoyés.

## Lier dépendances et tickets associés {#issue-dependencies}

Ouvrez les relations du ticket et recherchez l’autre par titre ou identifiant. Choisissez une relation de blocage lorsqu’une tâche doit finir avant qu’une autre puisse avancer. Si A bloque B, A est le préalable et B est bloqué par A. Une relation associée ajoute du contexte sans imposer cet ordre.

Lisez les deux identifiants et le sens affiché avant de confirmer. Par exemple, « Préparer le point d’accès » bloque « Connecter le client », pas l’inverse. Une dépendance ne transforme pas un ticket en sous-ticket, et la relation parent-enfant ne remplace pas un blocage.

![Recherche d’un préalable par identifiant de ticket.](/documentation/fr/work-dependencies.png)

### Blocages résolus ou hérités {#blocker-state}

Les états terminaux terminé, annulé et doublon cessent de bloquer le travail. Une relation relie des tickets ou objectifs du même projet ; ses deux extrémités doivent y être accessibles. Elle ne relie pas arbitrairement du travail privé de plusieurs projets et ne publie aucun des objets.

Un ticket ouvert peut hériter d’un blocage par son objectif ouvert. Si A bloque l’objectif B, les tickets ouverts rattachés à B affichent A comme blocage hérité, sans relation directe entre A et chaque ticket. L’affichage nomme le vrai blocage et l’objectif à l’origine de l’héritage. Inspectez cette relation d’objectif avant de chercher à la dissocier du ticket. Clôturer A, clôturer B ou retirer le ticket de B supprime ce blocage hérité. Le mécanisme suit l’appartenance à l’objectif, pas la hiérarchie parent/sous-ticket.

Retirez une relation devenue inexacte depuis ses commandes, puis vérifiez son libellé et l’indicateur de blocage. Marquer un doublon modifie son cycle de vie et désigne le travail conservé ; une simple relation associée ne clôture pas le doublon.

Si le sélecteur ne trouve pas un ticket, vérifiez son identifiant et l’accès au projet. Ne révélez pas un autre projet en copiant son lien privé dans une réponse publique à un retour.

## Découper un ticket en sous-tickets {#sub-issues}

Ouvrez le ticket parent et ses commandes de sous-tickets pour créer les parties du travail. Donnez à chaque enfant un résultat distinct. Après création, vérifiez projet, propriétés et identifiant du parent. La hiérarchie facilite le suivi ; elle ne remplace pas la description du résultat de chaque tâche.

La hiérarchie accepte un seul niveau : le parent doit être un ticket de premier niveau du même projet et un sous-ticket ne peut pas avoir ses propres enfants. Sans objectif explicitement choisi à la création, l’enfant hérite de celui du parent ; vérifiez les propriétés obtenues plutôt que de supposer que les modifications ultérieures du parent se propagent.

Un enfant reste un ticket avec son état et sa discussion. L’indicateur de progrès du parent est pondéré par l’effort des enfants et le crédit de progression de leurs états. Le compteur terminé/total de la liste des sous-tickets est un décompte brut distinct. Lisez les états des enfants avec ces deux mesures. Utilisez une dépendance pour « doit finir avant » et un parent pour « fait partie de cette tâche plus large ».

![Champ de création d’un sous-ticket dans un parent de démonstration.](/documentation/fr/work-sub-issues.png)

### Ouvrir ou retirer le parent {#change-parent}

L’identifiant du parent à côté du titre ouvre un menu. Son action d’ouverture permet d’inspecter la tâche globale. Pour détacher l’enfant, choisissez l’action de dissociation du parent, puis lisez la confirmation. Une dissociation réussie retire la relation tout en conservant le ticket.

Ne supprimez pas un enfant pour réorganiser la hiérarchie. Vérifiez les relations existantes avant de changer de parent et résolvez une relation refusée plutôt que de forcer une boucle. Après un échec de sauvegarde, rouvrez l’enfant pour vérifier si le changement a été appliqué avant de réessayer. Conservez le travail enfant terminé lors d’une révision du plan global.

## Maintenir un plan d’implémentation {#implementation-plans}

Ouvrez l’onglet Plan du ticket. La description doit déjà préciser problème et résultat attendu. Ajoutez les étapes manuellement, ou demandez à Numo de lire le dépôt lié avant de proposer un plan technique. Un chemin ou une fonction générés par IA ne sont pas une preuve si le dépôt n’a pas été inspecté.

Indentez une ligne de tâche de deux espaces par niveau ; une tabulation compte pour quatre espaces. Cette imbrication organise les étapes du plan, sans créer de relation parent-enfant entre tickets. Chaque tâche de travail non annulée contribue à la progression, y compris les tâches imbriquées.

Le plan utilise des lignes de tâches Markdown : `- [ ]` pour une tâche en attente, `- [~]` pour une tâche en cours, `- [x]` pour une tâche terminée et `- [-]` pour une tâche annulée. Placez le texte après le marqueur, par exemple `- [ ] Vérifier le lien de contact sur mobile`. Les tâches annulées ne comptent pas dans la progression. Les tâches sous un titre Questions reconnu sont traitées comme des questions et sont aussi exclues du calcul ; placez donc le travail dans une autre section de même niveau de titre. Enregistrez explicitement les modifications ; annuler abandonne le brouillon. Cocher une case du plan affiché modifie l’état de cette tâche. Utilisez les états en attente, en cours, terminé et annulé pour refléter ce qui s’est passé, sans suggérer une vérification qui n’a pas été exécutée.

![Plan de démonstration avec deux tâches de travail terminées sur six.](/documentation/fr/work-implementation-plan.png)

### Conserver le progrès et les changements concurrents {#plan-progress}

Complétez ou corrigez le plan existant plutôt que de le remplacer par une nouvelle copie décochée. Gardez les étapes terminées et les raisons des changements de périmètre. Avant une réécriture importante, comparez avec le dernier plan si un membre ou un agent travaille aussi sur le ticket.

Un plan écrit peut être confié à Numo lorsque le travail sur dépôt et son sandbox configuré sont disponibles. Après du travail accompli, l’interface propose aussi une vérification d’implémentation. Ces actions lancent du travail ; cocher une étape ne prouve pas que le code passe les tests. Lisez résultat, modifications et contrôles avant de terminer le ticket.

## Répéter un ticket après sa réalisation {#recurring-issues}

Créez ou ouvrez un ticket utile à chaque occurrence, comme une vérification périodique des dépendances. Fixez une échéance, puis choisissez une récurrence quotidienne, hebdomadaire, mensuelle ou annuelle dans le contrôle de date du ticket. Une récurrence sans échéance est refusée. Examinez propriétés et responsable avant d’enregistrer. Les réglages de récurrence du projet présentent les séries actives ; ils permettent de modifier leur rythme ou d’arrêter la répétition.

Un ticket récurrent se recrée lorsqu’il est terminé ; le suivant arrive dans le backlog. Après réalisation, vérifiez l’identifiant et les propriétés du ticket suivant.

L’échéance suivante reprend l’échéance précédente augmentée d’une période, pas le jour de réalisation. Le nouveau ticket reprend titre, description, priorité, effort, responsable, objectif et catégories. Il ne copie ni plan d’implémentation, ni parent, ni ressources, ni commentaires. La récurrence passe au ticket suivant ; rouvrir et terminer de nouveau l’ancien ne crée pas une autre occurrence. Si la création suivante échoue, la série s’arrête plutôt que de réessayer en boucle sur le ticket terminé. Examinez le résultat et configurez la récurrence sur la prochaine tâche appropriée après résolution de l’échec. Une récurrence calendaire ne signifie pas qu’un code sera exécuté ou que le nouveau ticket sera accompli automatiquement.


![Sélecteur d’échéance en mode récurrent avec aperçu hebdomadaire le dimanche et heure optionnelle.](/documentation/fr/issue-date-recurrence.png)

### Modifier ou arrêter {#recurrence-change}

Modifiez ou désactivez la répétition future dans les réglages de récurrence. Inspectez séparément les tickets déjà créés : arrêter les prochaines créations ne les termine ni ne les supprime.

Une routine Numo est différente : elle planifie une conversation et peut consommer le budget IA du propriétaire et utiliser ses fournisseurs configurés. Choisissez la récurrence pour une tâche suivie qui se répète, et une routine pour une instruction à exécuter selon un calendrier. Si le ticket suivant manque, vérifiez que le précédent est terminé, que la récurrence est active et que les filtres n’excluent pas le backlog.

## Modifier plusieurs tickets ensemble {#bulk-issue-actions}

Dans un tableau, maintenez Maj et cliquez sur chaque carte pour l’ajouter à la sélection ou l’en retirer. Avec une souris, vous pouvez aussi tracer un rectangle depuis une zone vide du tableau ; Maj, Commande ou Ctrl ajoute cette zone à la sélection existante. Le rectangle n’est pas un mode de sélection tactile. Vérifiez le nombre choisi et les identifiants visibles avant d’ouvrir les actions groupées. La sélection est l’ensemble ciblé par l’action, pas une vue enregistrée ni une autorisation supplémentaire.

Choisissez Actions dans la barre flottante de sélection pour ouvrir la palette de commandes. Choisissez l’état, la priorité, l’effort ou le responsable, définissez la valeur et validez le formulaire intégré. L’action sur l’objectif apparaît seulement pour une sélection appartenant à un projet avec des objectifs disponibles. Les autres actions, comme ajouter ou retirer des tickets du cycle, lier deux tickets ou confier la sélection à Numo, apparaissent selon les capacités du tableau courant. Inspectez ensuite les tickets concernés. Sur un appareil uniquement tactile sans geste de sélection multiple pris en charge, modifiez les tickets un par un dans leur panneau de détail.

![Menu d’actions pour deux tickets de démonstration sélectionnés.](/documentation/fr/work-bulk-actions.png)

### Résultats partiels et suppression {#bulk-results}

Pour plusieurs projets, vérifiez votre adhésion à chacun. Lisez les échecs partiels : certaines modifications peuvent déjà être enregistrées alors qu’un autre ticket a été refusé. Inspectez le résultat avant de réessayer toute la sélection.

La suppression touche chaque élément sélectionné ; confirmez donc l’ensemble avant de poursuivre. Effacez la sélection avant de passer à un autre travail. Un changement peut retirer des tickets de la vue filtrée sans les supprimer du projet. Recherchez leurs identifiants pour vérifier l’état obtenu plutôt que de les recréer.

## Importer un backlog CSV après contrôle {#import-issues}

Le propriétaire ouvre Import dans les réglages du projet et choisit un export CSV. Les formats de Linear et Jira sont détectés ; les autres CSV utilisent une correspondance générique. Chaque import est limité à 5 MiB et 5 000 tickets. Découpez un export plus grand de manière organisée et conservez, lorsque possible, les références aux parents dans le même lot.

Associez la colonne du titre avant d’importer. Examinez les correspondances de description, état, priorité, effort, échéance, catégories et responsables. Associez les personnes à des membres réels du projet et vérifiez les nouvelles catégories. Les références aux parents correspondent aux clés externes du lot et prennent en charge un seul niveau. Les CSV n’importent pas les octets des fichiers joints.

Une proposition IA n’est demandée que pour les correspondances manquantes. Elle reste modifiable ; un fournisseur indisponible ou en échec laisse utilisable la correspondance manuelle. Une correction manuelle empêche une proposition tardive d’écraser vos choix.

### Importer et contrôler {#result}

Après chaque modification des correspondances, lisez le nombre de tickets, la répartition des états et les avertissements. Corrigez les lignes ignorées ou invalides avant de confirmer. L’import crée de nouveaux tickets ; ne supposez pas que renvoyer le fichier effectue une mise à jour qui élimine les doublons. Après réussite, vérifiez des tickets représentatifs, leurs responsables, leurs dates et leurs parents. Si la réponse est perdue, examinez le projet avant de renvoyer le fichier entier pour éviter le travail en double.

![Aperçu CSV de deux lignes de démonstration localisées et des colonnes détectées.](/documentation/fr/import-issues-preview-workflow.png)
