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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
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
      "content/knowledge/pages.md",
      "components/pages/database-setup-banner.tsx",
      "components/pages/database-property-dialogs.tsx",
      "lib/page-creation-settlement.ts",
      "components/pages/page-database-view.tsx",
      "components/pages/database-cell-editor.tsx",
      "components/pages/database-column-name.tsx",
      "components/pages/database-import-dialog.tsx",
      "lib/server/database-import.ts",
      "content/documentation/reviews/second-pass-workflows-2026-10-10.md",
      "lib/database-import/types.ts",
      "lib/database-import/archive.ts"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root/second_workflows (second lightweight source and figure review; prior operational evidence retained; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/second_workflows (fr complete-body second pass and corrected wording review)",
    "date": "2026-10-10"
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
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/database-property-types.png",
      "alt": "Sélecteur de type de colonne : texte, nombre, sélections, dates, personnes et case à cocher.",
      "caption": "Choisissez un type adapté aux valeurs à conserver.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        464,
        336
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/database-entry.png",
      "alt": "Entrée de démonstration avec description, durée 2.5, case cochée et sélection vide.",
      "caption": "Ouvrez une entrée pour lire son texte complet et modifier les valeurs typées.",
      "revision": 7,
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
      "revision": 7,
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
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        744,
        511
      ],
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

Comme membre, ouvrez les pages, utilisez + et choisissez une base de données. Elle commence avec le nom des entrées, sans colonne optionnelle. Sa bannière propose une création avec Numo ou l’import d’une base existante. La configuration manuelle reste disponible sans IA. Choisir la création avec Numo ouvre une demande préparée avec cette base comme contexte de page, après confirmation de sa création. Relisez et envoyez la demande pour décrire la structure souhaitée ; ouvrir la conversation ne termine pas la configuration. Le travail IA nécessite un fournisseur configuré et un budget disponible ou une clé personnelle compatible. Inspectez le schéma et les entrées obtenus avant de vous y fier.

Ouvrez Colonnes et ajoutez une colonne, ou utilisez + à droite du tableau. Nommez-la et choisissez Texte, Nombre, Sélection, Sélection multiple, Date de création, Date, Personnes ou Case à cocher. Utilisez la recherche du sélecteur pour retrouver un type. Enregistrez, ajoutez une entrée et vérifiez la colonne dans la liste et la page d’entrée.

### Types et limites {#database-types}

Une base accepte 30 colonnes de propriétés en plus du nom. Sélection autorise une option, Sélection multiple plusieurs, avec 100 options maximum par colonne. Une cellule texte accepte 2 000 caractères. Nombre accepte les décimaux signés avec point ou virgule et refuse les lettres. La date de création est l’horodatage initial et ne se modifie pas.

Personnes sélectionne les membres du projet, pas des e-mails arbitraires. Les membres nouvellement mentionnés peuvent être notifiés. Chaque entrée est aussi une page avec contenu, commentaires et pièces jointes.

Formules avancées, automatisations et vues supplémentaires ne sont pas disponibles. Utilisez une propriété texte ou un document lié si les données ne correspondent pas à un type proposé ; ne présentez pas une formule non prise en charge comme une colonne fonctionnelle.


![Sélecteur de type de colonne : texte, nombre, sélections, dates, personnes et case à cocher.](/documentation/fr/database-property-types.png)

## Modifier les cellules et pages d’une base {#database-cells-and-entries}

Cliquez dans une cellule ou sur une propriété au-dessus du corps de l’entrée. Entrée enregistre, Échap annule, Maj+Entrée ajoute une ligne au texte. Quitter l’éditeur enregistre. Un nombre invalide le garde ouvert jusqu’à correction ; un échec de sauvegarde rétablit la valeur et affiche une erreur.

Le champ Sélection permet de choisir une option ; Sélection multiple permet d’en choisir plusieurs. Recherchez une option ou créez-la dans le menu. Ouvrez la modification des options pour renommer ou recolorer, puis enregistrez ensemble ou annulez. Les champs Date, Personnes et Case à cocher ont leurs propres commandes ; la date de création reste en lecture seule.

### Ouvrir, sélectionner et insérer {#entry-actions}

Ouvrez une entrée dans le panneau flottant. Agrandir l’ouvre en page entière une fois les sauvegardes en attente terminées. En cas d’échec, le panneau reste ouvert pour permettre la correction. Une entrée vide reste dans la base jusqu’à suppression.

Les cases des lignes permettent de sélectionner les entrées ; Maj-clic sélectionne une plage. La poignée ouvre les actions et réordonne en ordre manuel. Le + de marge insère en dessous ; Option/Alt permet de l’insérer au-dessus. L’insertion adjacente rétablit l’ordre manuel et enlève les filtres pour montrer la nouvelle entrée.

### Préférences d’affichage {#database-display}

Recherchez, filtrez, classez et masquez les colonnes dans l’unique vue liste. Ces choix restent sur l’appareil ; l’ordre manuel est partagé avec l’arbre. Faites défiler horizontalement avec le pavé tactile, Maj et molette, le toucher ou la barre inférieure. Un aperçu tronqué ne raccourcit pas la valeur stockée. Une entrée avec des valeurs peut se réordonner dans sa base, mais pas sortir de celle-ci.


![Entrée de démonstration avec description, durée 2.5, case cochée et sélection vide.](/documentation/fr/database-entry.png)

## Modifier le schéma d’une base {#change-a-database-schema}

Dans Colonnes, l’œil montre ou masque une propriété. Cliquez sur un en-tête pour renommer ou faites-le glisser pour réordonner ; le nom reste en première position. Les options de sélection simple ou multiple se modifient depuis la cellule ou Colonnes ; noms et couleurs s’enregistrent ensemble.

Masquer change l’affichage, sans supprimer les valeurs. Supprimer une colonne personnalisée retire ses valeurs de chaque entrée et ne peut pas être annulé. Lisez cette conséquence avant confirmation.

### Convertir le type {#convert-column}

Choisissez la modification d’une colonne personnalisée et son nouveau type. Le dialogue convertit les valeurs lors de l’enregistrement. Si certaines sont incompatibles, l’avertissement indique combien seront effacées. Continuez uniquement si cette perte est acceptable, ou annulez pour garder type et valeurs.

Passer à la date de création utilise la date initiale de chaque entrée et avertit avant remplacement. Après conversion, inspectez des exemples, notamment lorsqu’un nombre, une sélection ou une date peut changer d’interprétation.

Les agents modifient le schéma avec la révision courante et un jeton de prévisualisation. Un changement concurrent invalide cette prévisualisation. Relisez et prévisualisez de nouveau au lieu de forcer une ancienne conversion ; effacer les valeurs incompatibles nécessite une confirmation explicite.


![Avertissement de conversion : passer de Texte à Nombre efface une cellule incompatible, avec boutons Annuler et confirmation.](/documentation/fr/database-conversion-warning.png)

## Importer une base et le contenu de ses entrées {#import-a-database}

Créez une base sans colonnes optionnelles ni entrées. Depuis sa bannière, choisissez l’import d’une base existante. Envoyez un ZIP Notion Markdown & CSV avec sous-pages, un CSV de base ou une archive minddy. Si l’archive contient plusieurs bases, choisissez celle à importer.

Vérifiez noms et types suggérés, puis le nombre de pages avant confirmation. Numo peut proposer les types à partir d’un petit échantillon si l’assistance est configurée ; la correspondance manuelle reste disponible. Une propriété source non prise en charge reste du texte. Les valeurs incompatibles bloquent l’import au lieu d’être effacées silencieusement.

### Contenu conservé et contrôles {#database-import-result}

L’import comprend corps des entrées, documents imbriqués et fichiers locaux présents dans l’archive. Une archive minddy conserve aussi schéma exact et couleurs et réassocie les liens internes de pages et fichiers. Les personnes peuvent être associées aux membres du projet cible. L’export Notion ne contient ni schéma original, ni couleurs d’options, ni définitions de formules ; l’import ne récupère pas une information absente.

Les limites sont 20 Mo compressés, 50 Mo décompressés, 1 000 pages et 100 fichiers joints. Chaque fichier garde la limite de 10 Mo. L’écriture en base est transactionnelle. Réessayer la même tentative dans le dialogue ouvert conserve son identifiant de requête : une tentative déjà terminée est retournée sans dupliquer les lignes. Charger un autre fichier ou rouvrir un dialogue peut créer une nouvelle tentative. Après un résultat réseau incertain, inspectez la destination avant de recommencer ; une base déjà remplie ne répond plus au prérequis de destination vide.

Après succès, inspectez entrées, valeurs, sous-pages et fichiers. Gardez l’archive originale jusque-là. En cas d’échec, lisez la première erreur et corrigez format ou correspondance. Ne remplissez pas manuellement la destination en supposant qu’elle répond encore à l’exigence de base vide.


![Vérification d’un CSV local : deux pages d’entrées et deux colonnes, avec le bouton Importer la base.](/documentation/fr/database-import-review.png)
