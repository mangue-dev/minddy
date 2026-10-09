---
{
  "id": "pages",
  "locale": "fr",
  "title": "Pages",
  "summary": "Créez un wiki de projet, rédigez et commentez les pages, gérez les fichiers et l’historique, publiez ou exportez le contenu et retrouvez le parcours d’import des bases.",
  "topic": "Pages et bases de données",
  "type": "guide",
  "audiences": [
    "member",
    "visitor"
  ],
  "workflows": [
    "P01",
    "P02",
    "P03",
    "P04",
    "P05",
    "P06",
    "P07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
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
      "content/knowledge/pages.md",
      "components/pages/page-create-menu.tsx",
      "components/pages/page-tree.tsx",
      "components/pages/page-editor.tsx",
      "components/pages/page-slash-command.tsx",
      "components/pages/page-comment-popover.tsx",
      "components/pages/page-presence.tsx",
      "components/pages/page-conflict-banner.tsx",
      "lib/pages-merge.ts",
      "components/pages/page-view.tsx",
      "components/pages/page-uploads.tsx",
      "lib/server/page-files.ts",
      "lib/server/page-publication.ts",
      "components/pages/page-history.tsx",
      "lib/server/page-versions.ts",
      "components/pages/page-publish-dialog.tsx",
      "app/p/[token]/page.tsx",
      "components/pages/page-document-actions.tsx",
      "lib/server/pages-export.ts",
      "components/pages/page-print-view.tsx"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "notifications-and-inbox",
    "storage-and-attachments",
    "trash-and-recovery",
    "views",
    "permissions-and-public-links",
    "databases"
  ],
  "aliases": [
    "create-and-organize-pages",
    "page-editor",
    "page-comments-and-collaboration",
    "page-files",
    "page-history",
    "publish-a-page",
    "import-export-and-print-pages"
  ],
  "tags": [
    "Construire un wiki de projet",
    "Écrire une page avec blocs et mentions",
    "Discuter d’une page et gérer les conflits",
    "Joindre et récupérer des fichiers de page",
    "Inspecter et restaurer une version de page",
    "Publier une page et révoquer son lien",
    "Exporter ou imprimer une page"
  ],
  "figures": [
    {
      "id": "create-and-organize-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/page-create-menu.png",
      "alt": "Menu de création proposant Nouvelle page et Nouvelle base de données.",
      "caption": "Les contrôles des pages du projet permettent de choisir un document ou une base de données.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        302,
        152
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-editor-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/page-editor.png",
      "alt": "Page de démonstration avec titres, paragraphes, cases de tâches et mention d’un ticket.",
      "caption": "Les titres, blocs de tâches et la mention AUR-2 structurent la page. Ce contenu est un exemple de démonstration.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        922
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/page-comments.png",
      "alt": "Fenêtre d’activité de la page avec modification de démonstration et champ de commentaire vide.",
      "caption": "Lisez l’activité et rédigez un commentaire dans le champ. Aucun commentaire n’a été envoyé dans cet exemple.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        632,
        625
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-files-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/page-file-states.png",
      "alt": "Page de démonstration avec un envoi inachevé et un fichier enregistré de 67 octets proposant Télécharger.",
      "caption": "Vérifiez l’état réel du fichier : la seconde pièce jointe est disponible, contrairement au premier envoi inachevé.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        466
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-history-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/page-history-preview.png",
      "alt": "Onglet Versions avec un état antérieur déplié, son auteur, Restaurer et l’indication de conservation pendant 30 jours.",
      "caption": "Prévisualisez un état enregistré et comparez-le à la page actuelle avant de le restaurer.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        632,
        538
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "publish-a-page-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/page-publish.png",
      "alt": "Fenêtre de publication avec Privée sélectionné et options par mot de passe ou lien.",
      "caption": "Privée conserve la page dans le projet. Vérifiez le public souhaité avant de modifier la publication.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        496,
        230
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "import-export-and-print-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/page-export.png",
      "alt": "Menu d’export du document avec Markdown (.md) et Imprimer / PDF.",
      "caption": "Choisissez Markdown pour télécharger le document, ou Imprimer / PDF pour ouvrir la vue imprimable.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        211,
        128
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "create-and-organize-pages-steps",
    "page-editor-steps",
    "page-comments-and-collaboration-steps",
    "page-files-steps",
    "page-history-steps",
    "publish-a-page-steps",
    "import-export-and-print-pages-steps"
  ]
}
---

Les pages constituent le wiki d’un projet, avec ses documents, ses sous-pages et ses entrées de bases de données. Retrouvez l’organisation et la rédaction du contenu, la collaboration, les fichiers, les versions, la publication et l’export dans les sections suivantes. Les imports commencent depuis une base vide, selon le [guide des bases de données](/fr/documentation/databases#import-a-database).

## Construire un wiki de projet {#create-and-organize-pages}

Ouvrez les pages d’un projet dont vous êtes membre. Le menu + propose une page pour un document ou une base pour une liste structurée. Donnez un titre utile et écrivez la spécification, décision ou procédure à conserver.

Créez des sous-pages pour les documents associés et déplacez-les ou réordonnez-les dans l’arbre. Une page ne peut pas devenir sa propre descendante. Une duplication crée un nouveau contenu plutôt qu’une référence vivante. Examinez la branche dupliquée avant modification ou partage.

### Favoris et suppression {#page-tree}

Ajoutez une page aux favoris pour la faire apparaître en haut de l’arbre du projet. Ces favoris sont partagés dans le projet, contrairement à une note du carnet privé. Liez une page au ticket qui a besoin de son contenu actuel ; le titre de la ressource suit les renommages.

La suppression envoie les pages prises en charge à la corbeille. Vérifiez la branche avant de supprimer, puis utilisez la récupération lorsque le contenu doit être conservé. Une entrée avec des valeurs de colonnes peut être réordonnée dans sa base, mais pas déplacée à l’extérieur. Si un déplacement est refusé, vérifiez hiérarchie et type d’entrée plutôt que de le forcer.


![Menu de création proposant Nouvelle page et Nouvelle base de données.](/documentation/fr/page-create-menu.png)

## Écrire une page avec blocs et mentions {#page-editor}

Ouvrez la page et modifiez son titre ou son corps en tant que membre. Le menu slash et les commandes de mise en forme insèrent titres, paragraphes, listes, tâches, code, sections repliables et encadrés. Un encadré peut porter une icône emoji et une couleur de palette ; utilisez-les pour distinguer une information, sans faire de la couleur l’unique moyen de comprendre un avertissement.

Les mentions relient tickets, objectifs, personnes ou pages. Les liens retour aident à retrouver les pages qui citent celle-ci. Un lien apporte du contexte, sans ouvrir les objets privés d’un autre projet.


![Page de démonstration avec titres, paragraphes, cases de tâches et mention d’un ticket.](/documentation/fr/page-editor.png)

### Enregistrement et portabilité {#editor-save}

Surveillez l’indicateur d’enregistrement avant de quitter une modification importante. En cas de conflit, utilisez les commandes de récupération et conservez votre texte ; ne supposez pas que les deux modifications ont fusionné. L’historique aide à inspecter les versions enregistrées.

Les exports Markdown et les lectures par des agents préservent les icônes et couleurs des encadrés dans leur représentation prise en charge. La fidélité du contenu et le traitement des pièces jointes varient selon le format ; vérifiez le résultat avant de remplacer la source. Utilisez des blocs de code pour les commandes littérales et gardez les prérequis et les avertissements autour d’elles.

## Discuter d’une page et gérer les conflits {#page-comments-and-collaboration}

Ouvrez une page du projet et ses commentaires. Sélectionnez le contenu concerné pour créer un commentaire ancré, expliquez votre question ou votre proposition et mentionnez le membre à solliciter. Répondez dans le fil pour garder la décision près du contexte. Résolvez-le lorsque la question est effectivement traitée.

Les avatars de présence indiquent les personnes qui consultent la page. Ils ne prouvent pas que le texte non enregistré d’une autre personne a atteint le serveur ou que les modifications simultanées fusionnent automatiquement. Vérifiez l’enregistrement avant de quitter.


![Fenêtre d’activité de la page avec modification de démonstration et champ de commentaire vide.](/documentation/fr/page-comments.png)

### Résoudre un conflit d’enregistrement {#page-conflict}

minddy fusionne les modifications de blocs de premier niveau différents lorsqu’il peut conserver les deux changements. Il ne fusionne pas caractère par caractère les textes écrits simultanément dans un même bloc. Si les deux personnes ont modifié ce bloc, le document garde la version distante et une bannière propose votre ancien bloc pour examen.

Comparez le bloc désigné avec le document actuel. Choisissez Restaurer la mienne seulement si vous voulez le remplacer par votre version. Si votre action en conflit était une suppression, Le supprimer à nouveau applique explicitement cette suppression. Fermer conserve le document adopté et ferme l’avertissement ; cette action ne restaure pas votre version. Conservez le texte à garder avant de fermer et consultez l’historique si une récupération plus large est nécessaire. Ces choix ciblent le bloc identifié plutôt que de remplacer aveuglément toute la page.

Une modification du document peut détacher une ancre ; lisez la discussion avant de déplacer ou supprimer le bloc. Commentaires et activité restent internes au projet sauf contenu explicitement publié par un circuit pris en charge. Testez la page publiée pour connaître la vue réelle du visiteur plutôt que de supposer que les commandes collaboratives deviennent publiques.

## Joindre et récupérer des fichiers de page {#page-files}

Ouvrez la page comme membre et utilisez ses commandes de pièce jointe ou d’envoi. Choisissez un fichier non vide de 10 Mo maximum. Le quota du compte ou de l’instance peut ajouter une limite. Gardez l’original jusqu’au succès.

Les images peuvent être insérées en blocs d’image et les autres documents en blocs de fichier. Le serveur détermine le type stocké à partir des octets, sans se fier au nom du fichier ou au libellé du navigateur. L’envoi réussi ne garantit pas un aperçu intégré pour tous les formats ; téléchargez le fichier si l’aperçu est indisponible.

Vérifiez l’apparition du fichier, puis ouvrez-le ou téléchargez-le. Les octets sont dans Storage ; page et métadonnées déterminent l’accès. Une page enregistrée ne prouve pas à elle seule que les octets sont disponibles.

### Fichiers partagés et échecs {#file-access}

Un fichier référencé sur une page publiée peut être accessible à ses visiteurs. Un fichier d’une page hors de la branche publiée ne devient pas accessible par une simple référence ailleurs. Examinez page et enfants inclus avant partage.

Si l’envoi échoue, vérifiez taille, quota et erreur. En auto-hébergement, l’opérateur doit aussi vérifier configuration et règles Storage. Après restauration, un fichier absent nécessite les octets Storage et métadonnées correspondants ; restaurer uniquement la base ne recrée pas le fichier. Les adresses de fichiers publiés sont signées pour une durée allant jusqu’à 24 heures lors de l’affichage de la page. Révoquer un partage arrête les nouvelles visites autorisées de la page, sans invalider immédiatement les adresses déjà transmises : elles peuvent rester utilisables jusqu’à expiration. Les copies téléchargées ne peuvent pas être rappelées.


![Page de démonstration avec un envoi inachevé et un fichier enregistré de 67 octets proposant Télécharger.](/documentation/fr/page-file-states.png)

## Inspecter et restaurer une version de page {#page-history}

Ouvrez l’indicateur d’enregistrement ou d’historique pour les versions, ou les commentaires et l’activité pour les actions. Ces onglets répondent à des questions différentes : une version est un état du document, tandis que l’activité comprend aussi renommage, suppression ou restauration sans le même instantané.

Choisissez une version et prévisualisez-la. L’historique identifie les auteurs et les agents ; comparez le contenu avec la modification à annuler. L’interface annonce une fenêtre de 30 jours ; ce n’est pas une sauvegarde externe permanente.

### Restaurer et vérifier {#restore-page-version}

En tant que membre autorisé, restaurez uniquement après avoir examiné le contenu actuel qui sera remplacé. L’état juste avant restauration entre lui-même dans l’historique et peut être récupéré tant qu’il est conservé.

Rouvrez ou actualisez l’éditeur et vérifiez le corps réel. Un éditeur resté ouvert contient une version périmée et ne doit pas écraser aveuglément la restauration. Les versions ne sont pas des sauvegardes d’instance : les octets des pièces jointes, les fichiers supprimés et les objets liés peuvent suivre d’autres cycles. Consultez la [section des fichiers de page](#page-files) et la [procédure de restauration d’instance](/fr/documentation/backups-and-restoration#restore-and-roll-back) lorsque l’information manque hors du corps du document.


![Onglet Versions avec un état antérieur déplié, son auteur, Restaurer et l’indication de conservation pendant 30 jours.](/documentation/fr/page-history-preview.png)

## Publier une page et révoquer son lien {#publish-a-page}

Ouvrez la page comme membre et ses commandes de publication. Relisez contenu et pièces jointes. Choisissez privé, protégé par mot de passe ou public. Le mot de passe exige au moins huit caractères et s’applique après envoi ; sélectionner le mode seul ne crée pas de lien protégé.

Copiez le lien /p/ après réussite. Si la page a des descendants, examinez l’option d’inclusion des enfants et leur nombre. L’inclusion publie la branche choisie ; l’exclusion laisse leur contenu hors de cette publication. Une base publiée sans ses enfants ne révèle pas automatiquement tous les corps de ses entrées.

Ouvrez le lien dans une session sans votre compte. Testez mot de passe éventuel, contenu, sous-pages souhaitées et téléchargements. Vous vérifiez ainsi la lecture du visiteur plutôt que vos permissions de membre plus larges.


![Fenêtre de publication avec Privée sélectionné et options par mot de passe ou lien.](/documentation/fr/page-publish.png)

### Révoquer et contrôler {#revoke-page}

Revenez à la publication et choisissez privé. Après succès, ouvrez l’ancien lien anonymement pour vérifier le refus d’accès. Les copies ou captures déjà reçues ne peuvent pas être rappelées. Les adresses de téléchargement déjà transmises par une page publiée sont signées pour une durée allant jusqu’à 24 heures. La révocation bloque les nouvelles visites de la page, mais ces adresses peuvent rester valides jusqu’à leur expiration.

Les liens des utilisateurs restent noindex et distincts du manuel officiel indexé. Noindex limite la découverte, ce n’est pas un mot de passe. Si un enfant ou fichier est visible à tort, révoquez d’abord, inspectez la branche publiée et retestez avant d’envoyer un lien corrigé. Une référence interne ne donne pas accès aux fichiers d’une page non publiée.

## Exporter ou imprimer une page {#import-export-and-print-pages}

Ouvrez le menu du document, puis Exporter. Choisissez Markdown pour une page (.md) ou une branche (.zip), PDF pour ouvrir la vue d’impression, ou l’archive de base lorsque la page est une base de données. Vérifiez le périmètre proposé avant de confirmer : page, branche et archive de base n’ont pas le même contenu.

Ouvrez l’export pour vérifier titres, encadrés, liens et pièces jointes nécessaires au lecteur. L’action PDF ouvre une vue documentaire lisible. Utilisez les commandes d’impression du navigateur pour imprimer ou enregistrer un PDF. Le menu du document ne propose pas d’importation générale ; les imports pris en charge commencent depuis une base vide, selon la [section d’import des bases](/fr/documentation/databases#import-a-database).


![Menu d’export du document avec Markdown (.md) et Imprimer / PDF.](/documentation/fr/page-export.png)

### Archives de bases et limites {#export-fidelity}

L’archive de base (.zip) comprend la branche : Markdown et CSV, schéma exact et couleurs des options, valeurs, corps, dates de création, sous-pages et octets des fichiers. Importez-la dans une nouvelle base vide pour restaurer la structure. Filtres, classement et colonnes masquées propres à l’appareil restent sur l’appareil initial.

L’export ne transfère ni mots de passe, ni identifiants fournisseurs, ni abonnements. Pour déplacer le travail du compte entre instances, consultez le [guide du transfert des données](/fr/documentation/transfer-between-instances). Si un format importé ne conserve pas un bloc ou une propriété externe, vérifiez le résultat avant de remplacer l’original. Ne supprimez pas la source simplement parce qu’un téléchargement existe.
