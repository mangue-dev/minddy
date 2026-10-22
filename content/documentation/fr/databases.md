---
{
  "id": "databases",
  "locale": "fr",
  "title": "Bases de données",
  "summary": "Créez une base de données, modifiez les valeurs et les pages d’entrée, adaptez son schéma et importez une base complète en tenant compte des risques.",
  "topic": "Pages et bases de données",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P08",
    "P09",
    "P10",
    "P11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 17,
  "sourceRevision": 17,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
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
      "content/knowledge/pages.md",
      "components/pages/database-setup-banner.tsx",
      "components/pages/database-property-dialogs.tsx",
      "lib/page-creation-settlement.ts",
      "components/pages/page-database-view.tsx",
      "components/pages/database-cell-editor.tsx",
      "components/pages/database-column-name.tsx",
      "components/pages/database-import-dialog.tsx",
      "lib/server/database-import.ts",
      "lib/database-import/types.ts",
      "lib/database-import/archive.ts",
      "components/pages/page-database-properties.tsx",
      "components/date-time-picker.tsx",
      "lib/page-databases.ts",
      "scripts/page-database-date-times.integration.test.mjs",
      "components/pages/page-promotion-context.tsx",
      "components/pages/page-promotion-context.test.tsx",
      "components/pages/database-view-strip.tsx",
      "lib/use-page-database-views.ts",
      "lib/server/page-database-views.ts"
    ]
  },
  "review": {
    "revision": 17,
    "fact": "agent:/root/min764 (database views section checked against components/pages/database-view-strip.tsx, components/pages/page-database-view.tsx, lib/use-page-database-views.ts and lib/server/page-database-views.ts: named views shared by the project, each with its own sort, filter and hidden columns, managed and reordered by writers, adjusted locally by readers; insertion clears the active view's filter; rest of the article unchanged since the MIN-747 review; no figure changed)",
    "language": "agent:/root/min764 (fr changed passages on shared database views with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "pages"
  ],
  "aliases": [
    "create-a-database",
    "database-cells-and-entries",
    "change-a-database-schema",
    "import-a-database"
  ],
  "tags": [
    "Créer une base et ses colonnes",
    "Modifier les cellules et pages d’une base",
    "Modifier le schéma d’une base",
    "Importer une base et le contenu de ses entrées"
  ],
  "figures": [
    {
      "id": "database-setup-cards-preview",
      "kind": "screenshot",
      "src": "/documentation/fr/database-setup-cards.png",
      "alt": "Aperçu du composant proposant la création d’une base avec Numo ou l’import d’une base existante.",
      "caption": "Suggestions pour une nouvelle base, présentées avec des données de démonstration. Choisissez Numo ou l’import, ou masquez les cartes pour continuer manuellement.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-11",
      "viewport": [
        712,
        240
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    },
    {
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/database-property-types.png",
      "alt": "Sélecteur de type de colonne avec un champ de recherche : texte, nombre, sélections, dates, personnes et case à cocher.",
      "caption": "Choisissez un type adapté aux valeurs à conserver.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-18",
      "viewport": [
        448,
        357
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/database-entry.png",
      "alt": "Entrée de démonstration avec description, durée 2.5, case cochée et sélection vide.",
      "caption": "Ouvrez une entrée pour lire son texte complet et modifier les valeurs typées.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        429
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "change-a-database-schema-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/database-conversion-warning.png",
      "alt": "Avertissement de conversion : passer de Texte à Nombre efface une cellule incompatible, avec boutons Annuler et confirmation.",
      "caption": "Vérifiez le nombre réel de cellules incompatibles avant de confirmer. Annuler conserve les valeurs actuelles.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        456,
        306
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/database-import-review.png",
      "alt": "Vérification d’un CSV local : deux pages d’entrées et deux colonnes, avec le bouton Importer la base.",
      "caption": "Vérifiez les entrées analysées et le nombre de colonnes avant l’import dans la base vide.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        744,
        511
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "database-options-preview",
      "kind": "screenshot",
      "src": "/documentation/fr/database-options.png",
      "alt": "Aperçu du composant Modifier les options avec des statuts en français, des flèches vers le haut et le bas, des corbeilles et l’explication de la suppression.",
      "caption": "Modifiez ensemble les noms, les couleurs et l’ordre des options. La corbeille retire une option des modifications en cours ; Enregistrer applique les changements. Données de démonstration.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        560,
        448
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    },
    {
      "id": "database-date-time-preview",
      "kind": "screenshot",
      "src": "/documentation/fr/database-date-time.png",
      "alt": "Aperçu du sélecteur de date avec le 12 octobre 2026 sélectionné, Préciser l’heure activé et Heure réglée sur 14:30.",
      "caption": "Activez Préciser l’heure pour saisir une heure. Cet aperçu du composant utilise des données de démonstration et le fuseau horaire de l’appareil.",
      "revision": 17,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        324,
        444
      ],
      "deviceScaleFactor": 2,
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "create-a-database-steps",
    "database-cells-and-entries-steps",
    "change-a-database-schema-steps",
    "import-a-database-steps"
  ]
}
---

Une base de données associe un tableau de propriétés typées à une page complète pour chaque entrée. Créez les colonnes et modifiez les entrées manuellement, ou importez une base existante dans une destination vide. Avant de changer le type d’une propriété ou de supprimer une colonne, vérifiez quelles valeurs seront remplacées ou perdues.

## Créer une base et ses colonnes {#create-a-database}

La zone de configuration d’une nouvelle base propose deux cartes : **Créer avec Numo** pour préparer la structure, et **Importer une base existante**. Son bouton de fermeture, intitulé **Masquer l’aide à la création**, masque ces suggestions ; la modification manuelle reste disponible.

Comme propriétaire ou Membre du projet, ouvrez les pages, utilisez + et choisissez une base de données. Elle commence avec le nom des entrées, sans colonne optionnelle. Sa bannière propose une création avec Numo ou l’import d’une base existante. La configuration manuelle reste disponible sans IA. Choisir **Créer avec Numo** ouvre une demande préparée avec cette base comme contexte de page, après confirmation de sa création. Relisez et envoyez la demande pour décrire la structure souhaitée ; ouvrir la conversation ne termine pas la configuration. Le travail IA nécessite un fournisseur configuré et un budget disponible ou une clé personnelle compatible. Inspectez le schéma et les entrées obtenus avant de vous y fier.

Ouvrez Colonnes et ajoutez une colonne, ou utilisez + à droite du tableau. Nommez-la et choisissez Texte, Nombre, Sélection, Sélection multiple, Date de création, Date, Personnes ou Case à cocher. Utilisez la recherche du sélecteur pour retrouver un type. Enregistrez, ajoutez une entrée et vérifiez la colonne dans la liste et la page d’entrée.


![Aperçu du composant proposant la création d’une base avec Numo ou l’import d’une base existante.](/documentation/fr/database-setup-cards.png)

### Types et limites {#database-types}

Une base accepte 30 colonnes de propriétés en plus du nom. Sélection autorise une option, Sélection multiple plusieurs, avec 100 options maximum par colonne. Une cellule texte accepte 2 000 caractères. Nombre accepte les décimaux signés avec point ou virgule et refuse les lettres. La date de création est l’horodatage initial et ne se modifie pas.

Personnes sélectionne les membres du projet, pas des e-mails arbitraires. Les membres nouvellement mentionnés peuvent être notifiés. Chaque entrée est aussi une page avec contenu, commentaires et pièces jointes.

Formules avancées et automatisations ne sont pas disponibles. Utilisez une propriété texte ou un document lié si les données ne correspondent pas à un type proposé ; ne présentez pas une formule non prise en charge comme une colonne fonctionnelle.


![Sélecteur de type de colonne avec un champ de recherche : texte, nombre, sélections, dates, personnes et case à cocher.](/documentation/fr/database-property-types.png)

## Modifier les cellules et pages d’une base {#database-cells-and-entries}

Dans l’éditeur d’options, ajoutez une option sous les lignes existantes, même si la liste est vide. Donnez à chaque option un nom distinct et non vide, puis enregistrez. Cela fonctionne pour la sélection simple comme pour la sélection multiple.

Cliquez dans une cellule ou sur une propriété au-dessus du corps de l’entrée. Entrée enregistre, Échap annule, Maj+Entrée ajoute une ligne au texte. Quitter l’éditeur enregistre. Un nombre invalide le garde ouvert jusqu’à correction ; un échec de sauvegarde rétablit la valeur et affiche une erreur.

Le champ Sélection permet de choisir une option ; Sélection multiple permet d’en choisir plusieurs. Recherchez une option ou créez-la dans le menu. Ouvrez Modifier les options depuis une cellule, ou depuis le menu de l’en-tête d’une colonne Sélection ou Sélection multiple (cliquez sur le nom de la colonne), pour renommer ou recolorer, puis enregistrez ensemble ou annulez. Les champs Date, Personnes et Case à cocher ont leurs propres commandes ; la date de création reste en lecture seule.

Les nouvelles options reçoivent une couleur aléatoire de la palette qui n’est pas encore utilisée dans la colonne, qu’elles soient créées depuis une cellule ou dans le dialogue d’options. Lorsque les dix couleurs sont utilisées, elles peuvent se répéter. Vous pouvez toujours choisir la couleur manuellement.

Dans Modifier les options, utilisez les flèches vers le haut et le bas d’une ligne pour réordonner les options. Utilisez sa corbeille pour supprimer une option. Enregistrer applique ensemble les noms, les couleurs, l’ordre et les suppressions ; si vous avez supprimé des options, il les liste d’abord et demande de confirmer avec **Supprimer et enregistrer**, car la suppression est irréversible. Une option supprimée est retirée de toutes les entrées qui l’utilisent, y compris celles dans la corbeille ; les autres options sélectionnées sont conservées. Annuler abandonne les modifications en cours.

Choisissez un jour dans Date. Pour ajouter une heure, activez Préciser l’heure et remplissez Heure. La valeur s’enregistre pendant la modification et le sélecteur reste ouvert. Les valeurs avec heure s’affichent dans le fuseau horaire de votre appareil, y compris minuit. Désactiver Préciser l’heure conserve le jour affiché comme date sans heure. Les filtres de date correspondent au jour affiché.

![Aperçu du composant Modifier les options avec des statuts en français, des flèches vers le haut et le bas, des corbeilles et l’explication de la suppression.](/documentation/fr/database-options.png)

![Aperçu du sélecteur de date avec le 12 octobre 2026 sélectionné, Préciser l’heure activé et Heure réglée sur 14:30.](/documentation/fr/database-date-time.png)

### Ouvrir, sélectionner et insérer {#entry-actions}

Le contenu d’une entrée vide affiche un texte indicatif pour repérer la zone de rédaction. Depuis les actions d’une ligne ou une sélection de plusieurs lignes, la duplication demande confirmation avant de créer les copies. Le déplacement vers la corbeille demande aussi confirmation et conserve le fonctionnement récupérable de la corbeille, sans suppression définitive.

Ouvrez une entrée dans le panneau flottant. Agrandir l’ouvre en page entière une fois les sauvegardes en attente terminées. En cas d’échec, le panneau reste ouvert pour permettre la correction. Une entrée vide reste dans la base jusqu’à suppression.

Les cases des lignes permettent de sélectionner les entrées ; Maj-clic sélectionne une plage. La poignée ouvre les actions et réordonne en ordre manuel. Le + de marge insère en dessous ; Option/Alt permet de l’insérer au-dessus. L’insertion adjacente enlève le filtre de la vue active pour montrer la nouvelle entrée.

Depuis le menu de la poignée d’une seule entrée, le propriétaire ou un Membre peut choisir **Promouvoir en ticket** pour que Numo transforme cette entrée, son contenu et ses propriétés en un ticket. L’entrée reste dans la base. L’action est absente lorsque le menu vise plusieurs lignes sélectionnées : il n’existe pas de promotion groupée, promouvez donc chaque entrée séparément. Le [guide des pages](/fr/documentation/pages#promote-page-to-issue) décrit les questions de Numo et la marche à suivre lorsque l’entrée ne peut pas être enregistrée au préalable.

### Vues de la base {#database-display}

Une base présente ses entrées à travers des vues, listées au-dessus du tableau. Chaque vue garde son propre classement, son filtre et ses colonnes masquées, et tous les membres du projet voient les mêmes vues. Le propriétaire ou un Membre ajoute une vue avec **Nouvelle vue** (+), qui part de la vue affichée, renomme ou supprime la vue active depuis son menu d’options (⋯) avec **Renommer la vue** ou **Supprimer la vue**, et fait glisser les vues pour les réordonner. Les changements de classement, de filtre et de colonnes sont enregistrés dans la vue active pour tout le monde. Une base garde au moins une vue ; avant son premier changement, elle affiche la vue **Tableau** par défaut. Les lecteurs passent d’une vue à l’autre et peuvent en ajuster une pour eux-mêmes jusqu’à ce qu’ils quittent la page. Le navigateur retient la dernière vue ouverte ; la recherche n’est jamais enregistrée. L’ordre manuel est partagé avec l’arbre. Faites défiler horizontalement avec le pavé tactile, Maj et molette, le toucher ou la barre inférieure. Un aperçu tronqué ne raccourcit pas la valeur stockée. Une entrée avec des valeurs peut se réordonner dans sa base, mais pas sortir de celle-ci.


![Entrée de démonstration avec description, durée 2.5, case cochée et sélection vide.](/documentation/fr/database-entry.png)

## Modifier le schéma d’une base {#change-a-database-schema}

Le déplacement d’une colonne commence après un mouvement du pointeur et reste horizontal. Le curseur de déplacement apparaît uniquement pendant le glisser-déposer ; un clic normal ouvre toujours les actions de la colonne. Lorsqu’un en-tête de colonne a le focus, Entrée ou Espace ouvre ses actions. Appuyez sur F8 pour commencer le déplacement au clavier, utilisez Gauche ou Droite, puis Entrée pour confirmer ou Échap pour annuler.

Dans Colonnes, l’œil montre ou masque une propriété. Cliquez sur un en-tête pour renommer ou faites-le glisser pour réordonner ; le nom reste en première position. Les options de sélection simple ou multiple se modifient depuis la cellule ou Colonnes ; noms et couleurs s’enregistrent ensemble.

Masquer change l’affichage, sans supprimer les valeurs. Supprimer une colonne personnalisée retire ses valeurs de chaque entrée et ne peut pas être annulé. Lisez cette conséquence avant confirmation.

### Convertir le type {#convert-column}

Choisissez la modification d’une colonne personnalisée et son nouveau type. Le dialogue convertit les valeurs lors de l’enregistrement. Si certaines sont incompatibles, l’avertissement indique combien seront effacées. Continuez uniquement si cette perte est acceptable, ou annulez pour garder type et valeurs.

Passer à la date de création utilise la date initiale de chaque entrée et avertit avant remplacement. Après conversion, inspectez des exemples, notamment lorsqu’un nombre, une sélection ou une date peut changer d’interprétation.

Les agents modifient le schéma avec la révision courante et un jeton de prévisualisation. Un changement concurrent invalide cette prévisualisation. Relisez et prévisualisez de nouveau au lieu de forcer une ancienne conversion ; effacer les valeurs incompatibles nécessite une confirmation explicite.


![Avertissement de conversion : passer de Texte à Nombre efface une cellule incompatible, avec boutons Annuler et confirmation.](/documentation/fr/database-conversion-warning.png)

## Importer une base et le contenu de ses entrées {#import-a-database}

Créez une base sans colonnes optionnelles ni entrées. Depuis sa bannière, choisissez **Importer une base existante**. Envoyez un ZIP Notion Markdown & CSV avec sous-pages, un CSV de base ou une archive minddy. Si l’archive contient plusieurs bases, choisissez celle à importer.

Vérifiez noms et types suggérés, puis le nombre de pages avant confirmation. Numo peut proposer les types à partir d’un petit échantillon si l’assistance est configurée ; la correspondance manuelle reste disponible. Une propriété source non prise en charge reste du texte. Les valeurs incompatibles bloquent l’import au lieu d’être effacées silencieusement.

### Contenu conservé et contrôles {#database-import-result}

L’import comprend corps des entrées, documents imbriqués et fichiers locaux présents dans l’archive. Une archive minddy conserve aussi schéma exact et couleurs et réassocie les liens internes de pages et fichiers. Les personnes peuvent être associées aux membres du projet cible. L’export Notion ne contient ni schéma original, ni couleurs d’options, ni définitions de formules ; l’import ne récupère pas une information absente.

Les limites sont 20 Mo compressés, 50 Mo décompressés, 1 000 pages et 100 fichiers joints. Chaque fichier garde la limite de 10 Mo. L’écriture en base est transactionnelle. Réessayer la même tentative dans le dialogue ouvert conserve son identifiant de requête : une tentative déjà terminée est retournée sans dupliquer les lignes. Charger un autre fichier ou rouvrir un dialogue peut créer une nouvelle tentative. Après un résultat réseau incertain, inspectez la destination avant de recommencer ; une base déjà remplie ne répond plus au prérequis de destination vide.

Après succès, inspectez entrées, valeurs, sous-pages et fichiers. Gardez l’archive originale jusque-là. En cas d’échec, lisez la première erreur et corrigez format ou correspondance. Ne remplissez pas manuellement la destination en supposant qu’elle répond encore à l’exigence de base vide.


![Vérification d’un CSV local : deux pages d’entrées et deux colonnes, avec le bouton Importer la base.](/documentation/fr/database-import-review.png)


## Routines pour les nouvelles entrées {#entry-routines}

Le propriétaire du projet peut choisir cette base comme déclencheur dans [Routines](/docs/scheduled-routines#conditions). Les conditions utilisent les propriétés typées de l’entrée. Une entrée vide peut attendre que ses propriétés soient remplies. Création, duplication, import de base et déplacement autorisé vers la base comptent comme arrivées ; une restauration n’en crée pas. Supprimer une propriété référencée ou changer son type nécessite de corriger le filtre de la routine.
