---
{
  "id": "objectives",
  "locale": "fr",
  "title": "Objectifs",
  "summary": "Définissez le résultat d’un projet, rattachez le travail et interprétez la progression, les dépendances et la dynamique.",
  "topic": "Projets et tickets",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W10",
    "W11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 24,
  "sourceRevision": 24,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-09",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "components/objective-dialog.tsx",
      "components/objective-field-shortcuts.ts",
      "components/objective-detail.tsx",
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/editor/rich-editor.tsx",
      "components/editor/document-editor.tsx",
      "components/editor/comment-editor.tsx",
      "lib/server/description-collaboration.ts",
      "lib/use-description-collaboration.ts",
      "docs/document-collaboration.md",
      "components/creation-project-select.tsx",
      "lib/use-resource-mentions.ts",
      "lib/keyboard/shortcuts.ts",
      "lib/objective-order.ts",
      "components/objective-label.tsx",
      "components/editor/mobile-editor-toolbar.tsx",
      "lib/palette-picker.ts",
      "components/palette-picker-rows.tsx",
      "app/(app)/projects/[id]/page.tsx",
      "components/objectives/objectives-page.tsx",
      "components/app-sidebar.tsx",
      "lib/objective-forecast.ts",
      "lib/server/objective-forecast.ts",
      "app/api/objectives/[id]/forecast/route.ts",
      "lib/server/smart-fill-objective.ts",
      "lib/server/smart-assign-objective.ts",
      "lib/server/objectives.ts",
      "lib/smart-assign-config.ts",
      "components/settings/account-smart-fill-section.tsx",
      "lib/smart-fill.ts"
    ]
  },
  "review": {
    "revision": 24,
    "fact": "agent:claude-code (new section on Smart Fill and Smart Assign for objectives, MIN-919: Smart Fill button and arrow menu in the new-objective form, name/color/target date filled only when empty, Smart Assign in place of an empty lead in every lead picker, lead chosen from the closest assigned issues or the owner; checked against components/objective-dialog.tsx, lib/server/objectives.ts, lib/server/smart-fill-objective.ts, lib/server/smart-assign-objective.ts, components/objective-detail.tsx and components/objectives/objectives-page.tsx; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured, the existing figure does not show the Smart Fill button; Follow-up: the target date keeps the time the text gives, resolved in the author's time zone, and the new Fill created objectives switch; checked against lib/server/smart-fill-objective.ts, components/settings/account-smart-fill-section.tsx and lib/smart-fill.ts; the objective name follows its own Write missing names switch)",
    "language": "agent:claude-code (fr translation of the changed passages with catalog UI labels, reviewed against en revision 24; agent review, not human acceptance)",
    "date": "2026-11-09"
  },
  "related": [
    "issues",
    "personal-cycle",
    "personal-statistics"
  ],
  "aliases": [
    "objective-dependencies-and-momentum"
  ],
  "tags": [
    "Suivre un résultat avec un objectif",
    "Interpréter les dépendances et la dynamique d’un objectif"
  ],
  "figures": [
    {
      "id": "objectives-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/reader-objectives.png",
      "alt": "Dialogue de création d’objectif non envoyé dans le projet Aurora, avec un nom de résultat d’exemple et le bouton Créer l’objectif.",
      "caption": "Nommez le résultat avant de choisir le responsable, la date cible et l’état. Ce dialogue n’a pas créé un deuxième objectif.",
      "revision": 24,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        720,
        342
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "objectives-steps"
  ]
}
---

Un objectif regroupe les tickets d’un projet autour d’un résultat. Créez-le et associez le travail concerné, puis examinez la progression, les dépendances bloquantes et la dynamique avant de modifier la date cible ou de clôturer l’objectif.

## Suivre un résultat avec un objectif {#objectives}

Ouvrez les objectifs du projet et créez-en un. Si vous le créez depuis un autre endroit de l’application, choisissez son projet dans **Créer dans**, en haut à gauche du formulaire (à côté du titre **Nouvel objectif** sur téléphone) ; changer de projet retire le responsable et les relations choisis pour le précédent. Sur ordinateur, Commande/Ctrl+Maj+P ouvre ce menu, même pendant la saisie du nom ou de la description ; une fois le projet choisi ou le menu fermé, le curseur revient exactement où il était. La pastille affiche ce raccourci, qui n’existe que si plusieurs projets peuvent être choisis ; sur téléphone, aucun raccourci n’est indiqué. Nommez le résultat recherché, ajoutez le contexte utile et renseignez les champs disponibles de responsable, date cible, couleur et état. Sur ordinateur, les mêmes touches que pour les champs d’un ticket les ouvrent dès que le curseur quitte le nom et la description : S l’état, A le responsable, D la date cible, R une relation, et C la couleur ; l’infobulle de chaque sélecteur affiche sa touche. Le responsable suit le résultat ; le choisir ne transfère pas la propriété du projet. Seul le propriétaire ou un Membre peut être responsable d’un objectif, et un responsable dont le rôle passe à Lecteur en est retiré. Un objectif appartient à un projet ; il diffère du cycle personnel qui couvre plusieurs projets.

La description de l’objectif et ses commentaires utilisent le même éditeur que les pages du projet, sans les poignées de bloc : tapez `/` pour insérer des blocs et `@` pour mentionner une personne, un ticket, un objectif ou une page. Le menu `@` propose aussi les ressources jointes à ce que vous rédigez : le ticket ou l’objectif pour sa description et son plan, un commentaire pour ses propres fichiers, ou une fenêtre de création pour les fichiers ajoutés. Une mention d’une ressource jointe ailleurs s’affiche **Indisponible**. Plusieurs personnes peuvent modifier la description en même temps, avec le curseur de chacune affiché avec son nom et sa couleur. Sélectionnez du texte pour le mettre en forme ou ajouter un lien. Collez ou déposez une image, ou choisissez **Image** dans le menu `/`, pour l’insérer dans la description. Sur un téléphone, la barre au-dessus du clavier remplace la barre de sélection et le menu `@` à la saisie ; le [guide des pages](/fr/documentation/pages#editor-formatting) la décrit.

Dans les propriétés de chaque ticket concerné, choisissez l’objectif, ou utilisez les commandes de tickets de l’objectif. Le sélecteur d’objectif présente les objectifs ouverts avant ceux terminés ou annulés ; dans chaque groupe, ceux qui ont reçu le plus de tickets au cours des 30 derniers jours viennent en tête. Chacun affiche son statut et son nom dans sa couleur. Vérifiez que le travail voulu apparaît. Ses discussions et ressources conservent les décisions et pages de référence applicables au résultat global.

![Dialogue de création d’objectif non envoyé dans le projet Aurora, avec un nom de résultat d’exemple et le bouton Créer l’objectif.](/documentation/fr/reader-objectives.png)

Sur la page des objectifs, maintenez Maj et cliquez sur des objectifs pour en sélectionner plusieurs ; un clic dans l’espace vide de la liste vide la sélection. **Actions** dans la barre flottante, ou Command+K sur macOS ou Ctrl+K ailleurs, propose **Changer le statut**, **Changer le responsable**, **Changer la couleur** et **Déplacer vers la corbeille**, qui demande d’abord une confirmation. **Demander à Numo** ouvre Numo avec tous les objectifs sélectionnés dans son contexte.

### Laisser Smart Fill et Smart Assign compléter un objectif {#objective-smart-fill}

Lorsque Smart Fill est activé pour votre compte, le formulaire **Nouvel objectif** affiche le bouton **Smart Fill**, comme celui d’un nouveau ticket ; **Remplir les objectifs créés**, dans **Paramètres du compte** → **Smart Fill**, décide s’il démarre activé. Tant qu’il est activé, décrivez l’objectif : Smart Fill choisit sa couleur d’après le sens des couleurs, pose sa date cible quand le nom ou la description en donne une, par exemple « livraison fin janvier », avec son heure quand le texte en donne une, par exemple « le 30 novembre à 19 h 30 », et, avec **Rédiger les noms manquants** activé, écrit un nom court si vous laissez le nom vide, en gardant ce qui identifie l’objectif, comme un nom de version ou un identifiant technique. La couleur et la date cible quittent la ligne du formulaire. Pour en fixer une vous-même, ouvrez la flèche à côté du bouton et choisissez-la ; **Titre**, dans le même menu, fait revenir le champ du nom. Sur ordinateur, Commande/Ctrl+Maj+F ouvre ce menu. Smart Fill ne remplit que ce que vous avez laissé vide, ne pose jamais une date que le texte ne donne pas et vous laisse l’état. L’objectif apparaît une fois rempli, et son activité nomme Smart Fill. Ce passage compte dans votre part **Automatisations**. Si votre budget est épuisé ou si le fournisseur échoue, l’objectif est créé tel que vous l’avez écrit, nommé d’après la première ligne de sa description si vous avez laissé le nom vide. Désactiver Smart Fill pour l’objectif fait revenir tous les champs. Les objectifs créés depuis un brief ne sont pas remplis.

Lorsque le Smart Assign du projet est activé, les sélecteurs de responsable affichent **Smart Assign** à la place d’un responsable vide : dans le formulaire de création, le panneau de l’objectif, le menu de l’objectif dans la liste et **Changer le responsable**. Un objectif créé sans responsable en reçoit un : le membre dont les tickets attribués sont les plus proches de son nom et de sa description, ou le propriétaire du projet si aucun ticket ne correspond. Choisir **Smart Assign** pour un objectif existant retire son responsable et laisse Smart Assign en choisir un de nouveau. Les objectifs **Terminé** et **Annulé** gardent **Sans responsable**. L’activité nomme Smart Assign. La recherche des tickets les plus proches compte dans la part **Automatisations** du propriétaire du projet et utilise l’index des tickets lorsque celui-ci l’autorise ; sinon, elle compare les mots, sans coût.

### Lire le progrès avant de clôturer {#objective-progress}

Examinez les tickets actifs et terminés avec le progrès de l’objectif. L’indicateur résume le travail associé ; il ne peut pas décider si un résultat produit est satisfaisant. Inspectez les tâches manquantes, les annulations et les doublons avant de terminer l’objectif. Le tableau de l’objectif montre d’abord le travail ouvert : sélectionnez **Terminé** et **Annulé** dans son filtre **Statut** pour y revoir les tickets fermés. Sur ordinateur, tant que le tableau montre les tickets d’un objectif, la barre latérale reste sur la liste des objectifs, sous la ligne de retour **Objectifs**, avec cet objectif en surbrillance ; choisissez un autre objectif dans cette liste pour y basculer le tableau.

Le cycle de vie distingue résultats prévus, en cours, terminés et annulés. Une date cible est un but ; une prévision est une estimation fondée sur l’activité. Si l’objectif paraît vide, vérifiez les tickets associés et les filtres plutôt que de le recréer. Supprimer un objectif relève de la corbeille récupérable, pas d’un changement d’état ordinaire.

## Interpréter les dépendances et la dynamique d’un objectif {#objective-dependencies-and-momentum}

Ouvrez les relations de l’objectif. Sur la page de l’objectif, hors d’un champ de texte, R ouvre le choix du type de relation. Une fois le type choisi, le ticket ou l’objectif se choisit dans la palette de commandes, comme sur un ticket. Vérifiez quel résultat dépend d’un autre et consultez les dépendances de tickets qui expliquent une contrainte. Hiérarchie, association et blocage répondent à des questions différentes ; inspectez le sens avant de modifier la relation.

Une relation de blocage peut relier un ticket ou un autre objectif à cet objectif, dans le même projet. Ses tickets membres ouverts héritent du blocage non résolu : l’affichage identifie le vrai préalable et l’objectif qui le transmet. Ce n’est pas une nouvelle relation directe enregistrée sur chaque ticket. Clôturer le ticket ou l’objectif bloquant, ou l’objectif bloqué, ou retirer un ticket de cet objectif, supprime le blocage hérité correspondant. Résolvez le vrai préalable ou corrigez une relation obsolète. Modifier la date cible d’un objectif ne termine pas ses tickets bloquants.

### Interpréter le signal de dynamique {#momentum}

Le panneau Élan apparaît uniquement si l’objectif a une date cible. Supprimer cette date masque le panneau, y compris l’historique, les statistiques de rythme et la date de fin estimée. Ajoutez une date cible pour le réafficher ; l’indicateur de progression globale reste disponible sans date cible.

La dynamique résume le travail récemment terminé. Elle peut accélérer, rester stable, ralentir ou stagner, avec des états distincts pour les objectifs non démarrés, terminés et annulés. Utilisez ce signal pour repérer un résultat qui mérite votre attention, puis consultez tickets et activité.

La date de fin estimée part des personnes qui font le travail. Pour chaque personne assignée à des tickets associés, minddy déduit ses heures d’activité habituelles des moments où elle termine des tickets, mesure l’effort qu’elle réalise sur l’ensemble de ses projets et estime la part de cet effort consacrée à cet objectif d’après ses réalisations récentes et son travail ouvert. L’estimation n’avance que pendant ces heures d’activité : les nuits et les week-ends n’ajoutent aucune progression, et le travail non assigné est réparti entre les contributeurs. Le calcul a lieu sur le serveur : les tickets des autres projets et les chiffres de chaque personne ne sont jamais affichés, seule la date qui en résulte l’est.

Une personne est prise en compte dès qu’elle a terminé au moins deux tickets au cours des six dernières semaines. Sans personne dans ce cas, l’estimation revient au rythme propre de l’objectif, qui exige au moins deux réalisations, une semaine complète d’observation, un effort réalisé positif et du travail restant. Seuls les tickets actuellement associés contribuent à la dynamique ; les réalisations antérieures à la création de l’objectif ne comptent pas dans la dynamique récente.

- Avec une date cible valide, l’historique va de la création à cette date. Le débit utilise le temps observé depuis la création, y compris après une échéance dépassée.
- Si une date cible est renseignée mais ne définit pas une période valide après la création, le calcul utilise huit semaines d’historique glissant et une fenêtre de prévision de 28 jours.

Un historique limité ou un changement récent de périmètre rend l’estimation moins utile. Ce n’est pas une date promise, et elle exclut le travail non associé. Comparez la date cible, les tâches restantes et les contraintes réelles avant de changer vos engagements.


## Choisir un objectif pour un retour {#objective-feedback}

Dans les propriétés de l’objectif, le nombre de retours ouvre la page Retours du projet filtrée sur cet objectif, avec les demandes résolues. La ligne est masquée tant qu’aucune demande n’appartient à l’objectif. Les retours restent distincts de la progression des tickets et de la dynamique.

Un retour peut aussi être lié à un objectif sans devenir un ticket. Dans les Retours du projet, choisissez l’objectif dans les propriétés de la demande. Ces demandes ne contribuent ni à la progression des tickets ni à leur dynamique. Lors de la conversion, le ticket reprend l’objectif et les catégories du retour, sous réserve des modifications dans le formulaire de création.
