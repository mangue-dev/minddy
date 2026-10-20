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
  "revision": 14,
  "sourceRevision": 14,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-680); MIN-693 project roles; MIN-718 hybrid issue search; MIN-688 live collaboration; MIN-684 page promotion; MIN-743 destructive-action confirmations",
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
      "components/pages/page-print-view.tsx",
      "components/file-viewer.tsx",
      "components/image-viewer.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "lib/use-semantic-mentions.ts",
      "components/markdown-mention.tsx",
      "components/editor/comment-editor.tsx",
      "docs/page-collaboration.md",
      "lib/use-page-collaboration.ts",
      "lib/page-collaboration-stream.ts",
      "components/pages/page-promotion-context.tsx",
      "components/pages/page-promotion-context.test.tsx",
      "components/pages/page-database-view.tsx"
    ]
  },
  "review": {
    "revision": 14,
    "fact": "agent:/root (MIN-680 source, focused route/UI tests and isolated browser review; prior controls retain existing evidence); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-718 hybrid issue search source and unit-test review; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-688 live collaboration: source, convergence/authority unit tests and a rollback-only database probe; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-684 page promotion: source and focused unit-test review of the menu entries, reader gating, save-before-promote and the Numo request; no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-743 destructive-action confirmations: source review of the confirmation dialogs for page-menu Move to trash and unpublishing; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root (fr changed-text and retained-meaning self-review); agent:/root/min693_fr with agent:/root (fr MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance); agent:/root (fr translation of MIN-718 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root/min688_fr with agent:/root (fr MIN-688 translation of the rewritten saving, presence and conflict passages; agent review, not human acceptance); agent:/root (fr translation of the MIN-684 promotion section with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (fr MIN-743 confirmation clauses with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "revision": 14,
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
      "revision": 14,
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
      "revision": 14,
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
      "revision": 14,
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
      "revision": 14,
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
      "revision": 14,
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
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        211,
        128
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "page-file-preview",
      "kind": "screenshot",
      "src": "/documentation/fr/file-preview.png",
      "alt": "Lecteur CSV sur toute la fenêtre avec des tâches de projet d’exemple, un grand bouton Fermer et le menu Actions du fichier proposant Télécharger et Retirer.",
      "caption": "Le lecteur commun place Fermer sous l’aperçu. Le menu Actions du fichier propose Télécharger et, si les droits le permettent, Retirer.",
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-10-12",
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
    "create-and-organize-pages-steps",
    "page-editor-steps",
    "page-comments-and-collaboration-steps",
    "page-files-steps",
    "page-history-steps",
    "publish-a-page-steps",
    "import-export-and-print-pages-steps",
    "page-file-preview"
  ]
}
---

Les pages constituent le wiki d’un projet, avec ses documents, ses sous-pages et ses entrées de bases de données. Retrouvez l’organisation et la rédaction du contenu, la collaboration, les fichiers, les versions, la publication et l’export dans les sections suivantes. Les imports commencent depuis une base vide, selon le [guide des bases de données](/fr/documentation/databases#import-a-database).

## Construire un wiki de projet {#create-and-organize-pages}

Ouvrez les pages d’un projet dont vous êtes membre. Le menu + propose une page pour un document ou une base pour une liste structurée. Donnez un titre utile et écrivez la spécification, décision ou procédure à conserver.

Créez des sous-pages pour les documents associés et déplacez-les ou réordonnez-les dans l’arbre. Une page ne peut pas devenir sa propre descendante. Une duplication crée un nouveau contenu plutôt qu’une référence vivante. Examinez la branche dupliquée avant modification ou partage.

### Favoris et suppression {#page-tree}

Ajoutez une page aux favoris pour la faire apparaître en haut de l’arbre du projet. Ces favoris sont partagés dans le projet, contrairement à une note du carnet privé. Liez une page au ticket qui a besoin de son contenu actuel ; le titre de la ressource suit les renommages.

La suppression envoie les pages prises en charge à la corbeille. Depuis un menu de page, **Déplacer vers la corbeille** demande d’abord une confirmation qui nomme la page et le nombre de sous-pages emportées ; elles restent restaurables depuis la corbeille pendant 30 jours. Vérifiez la branche avant de supprimer, puis utilisez la récupération lorsque le contenu doit être conservé. Une entrée avec des valeurs de colonnes peut être réordonnée dans sa base, mais pas déplacée à l’extérieur. Si un déplacement est refusé, vérifiez hiérarchie et type d’entrée plutôt que de le forcer.


![Menu de création proposant Nouvelle page et Nouvelle base de données.](/documentation/fr/page-create-menu.png)

## Promouvoir une page en ticket {#promote-page-to-issue}

Quand une page décrit du travail à faire, le propriétaire ou un Membre peut la transformer en ticket avec Numo. Les lecteurs ne voient pas cette action. La promotion nécessite un budget IA disponible ou une clé personnelle compatible.

1. Choisissez **Promouvoir en ticket** dans le menu de la page dans l’arbre (`…` ou clic droit sur la ligne) ou dans le menu `…` de la page ouverte (**Options de la page**). La même action est proposée pour une entrée de base ouverte dans le panneau latéral, ainsi que dans le menu de la poignée d’une seule entrée, comme l’explique le [guide des bases de données](/fr/documentation/databases#entry-actions).
2. Si la page ouverte contient des modifications non enregistrées, minddy les enregistre d’abord. Si cet enregistrement échoue, minddy indique que la page n’a pas pu être enregistrée et Numo ne s’ouvre pas. Relancez la promotion une fois la page enregistrée.
3. Numo s’ouvre dans le projet de la page, avec la page en contexte, et reçoit une demande : lire son titre, son contenu et, pour une entrée de base, ses propriétés. Si la page manque de clarté, ou si une base laisse le périmètre du ticket ambigu, Numo pose ses questions avant de créer quoi que ce soit. Répondez-y dans la conversation.
4. Numo crée un seul ticket et y joint la page. Ouvrez le ticket et vérifiez son identifiant, son périmètre, ses propriétés et la page jointe.

Contrairement à une tâche promue depuis le carnet, la page n’est pas retirée : elle reste à sa place dans l’arbre, avec son contenu et ses sous-pages. Si la création échoue ou que le résultat reste incertain après une erreur réseau, cherchez le ticket avant de relancer la promotion.

## Écrire une page avec blocs et mentions {#page-editor}

Ouvrez la page et modifiez son titre ou son corps en tant que propriétaire ou Membre. Les lecteurs peuvent ouvrir et lire les pages, mais ne peuvent ni les modifier, ni les importer, ni les dupliquer, ni les ajouter aux favoris, ni les publier, ni restaurer une version. Le menu slash et les commandes de mise en forme insèrent titres, paragraphes, listes, tâches, code, sections repliables et encadrés. Un encadré peut porter une icône emoji et une couleur de palette ; utilisez-les pour distinguer une information, sans faire de la couleur l’unique moyen de comprendre un avertissement.

Les mentions relient tickets, objectifs, personnes ou pages. Tapez `@` suivi d’un identifiant, de mots du titre ou d’une courte description ; une requête descriptive liste aussi des tickets trouvés [par le sens](/docs/navigation#search-by-meaning) sous **Liés par le sens**, après les correspondances textuelles. Les liens retour aident à retrouver les pages qui citent celle-ci. Un lien apporte du contexte, sans ouvrir les objets privés d’un autre projet.


![Page de démonstration avec titres, paragraphes, cases de tâches et mention d’un ticket.](/documentation/fr/page-editor.png)

### Enregistrement et portabilité {#editor-save}

Une page s’enregistre pendant la saisie : chaque modification parvient au serveur en quelques instants, et l’indicateur d’enregistrement affiche l’enregistrement en cours jusqu’à ce que le serveur l’ait acceptée. Plusieurs personnes peuvent modifier la même page en même temps, y compris le même paragraphe ou le titre. Les modifications de chacun apparaissent chez les autres au fil de la saisie, tout comme celles que Numo ou un agent connecté par MCP apporte à la page.

Si la connexion est coupée, gardez la page ouverte. Les modifications non enregistrées restent sur la page et sont envoyées au retour de la connexion ; celles des autres arrivent en même temps et fusionnent avec les vôtres. minddy n’ouvre une autre page qu’une fois vos modifications enregistrées : tant qu’elles ne peuvent pas être envoyées, il vous garde sur la page et signale l’échec de l’enregistrement. Fermer un onglet du navigateur avec des modifications non enregistrées vous demande d’abord de confirmer ; quitter l’application de bureau ne le demande pas, et ces modifications sont perdues. Si vous perdez l’accès à la page ou le droit de la modifier alors que des modifications ne sont pas enregistrées, minddy les annule et affiche un message. Lorsque le serveur refuse une modification, par exemple un titre de plus de 500 caractères ou un lien dont le protocole n’est pas autorisé, minddy annule cette modification et affiche un message. L’historique aide à inspecter les versions enregistrées.

Les exports Markdown et les lectures par des agents préservent les icônes et couleurs des encadrés dans leur représentation prise en charge. La fidélité du contenu et le traitement des pièces jointes varient selon le format ; vérifiez le résultat avant de remplacer la source. Utilisez des blocs de code pour les commandes littérales et gardez les prérequis et les avertissements autour d’elles.

## Discuter d’une page et gérer les conflits {#page-comments-and-collaboration}

Ouvrez une page du projet et ses commentaires. Sélectionnez le contenu concerné pour créer un commentaire ancré, expliquez votre question ou votre proposition et mentionnez le membre à solliciter. Un lecteur peut commenter lorsque le propriétaire a activé **Peut commenter** pour lui. Répondez dans le fil pour garder la décision près du contexte. Résolvez-le lorsque la question est effectivement traitée.

Les `avatars` de présence indiquent les personnes qui consultent la page. Pendant qu’une personne modifie la page, son curseur et sa sélection apparaissent dans le corps et dans le titre, dans une couleur qui lui est propre et accompagnés de son nom. Le curseur d’un lecteur n’est pas affiché. Un curseur montre où quelqu’un travaille, pas que son texte est enregistré : l’indicateur d’enregistrement ne reflète que vos propres modifications.


![Fenêtre d’activité de la page avec modification de démonstration et champ de commentaire vide.](/documentation/fr/page-comments.png)

### Résoudre un conflit d’enregistrement {#page-conflict}

Les modifications simultanées fusionnent automatiquement, caractère par caractère, y compris à l’intérieur d’un même paragraphe. Une bannière de conflit peut toutefois apparaître lorsque minddy doit recharger la page alors que vous avez des modifications non enregistrées : après une déconnexion pendant laquelle de nombreuses modifications ont eu lieu, ou après une modification faite sans édition en direct, comme un import dans une base de données. Si vos modifications et la version rechargée ont changé le même bloc de premier niveau, le document garde la version rechargée de ce bloc et la bannière vous propose la vôtre pour examen.

Comparez le bloc désigné avec le document actuel. Choisissez Restaurer la mienne seulement si vous voulez le remplacer par votre version. Si votre action en conflit était une suppression, Le supprimer à nouveau applique explicitement cette suppression. Fermer conserve le document adopté et ferme l’avertissement ; cette action ne restaure pas votre version. Conservez le texte à garder avant de fermer et consultez l’historique si une récupération plus large est nécessaire. Ces choix ciblent le bloc identifié plutôt que de remplacer aveuglément toute la page.

Une modification du document peut détacher une ancre ; lisez la discussion avant de déplacer ou supprimer le bloc. Commentaires et activité restent internes au projet sauf contenu explicitement publié par un circuit pris en charge. Testez la page publiée pour connaître la vue réelle du visiteur plutôt que de supposer que les commandes collaboratives deviennent publiques.

## Joindre et récupérer des fichiers de page {#page-files}

Ouvrez la page comme membre et utilisez ses commandes de pièce jointe ou d’envoi. Choisissez un fichier non vide de 10 Mo maximum. Le quota du compte ou de l’instance peut ajouter une limite. Gardez l’original jusqu’au succès.

Les images peuvent être insérées en blocs d’image et les autres documents en blocs de fichier. Le serveur détermine le type stocké à partir des octets, sans se fier au nom du fichier ou au libellé du navigateur. L’envoi réussi ne garantit pas un aperçu intégré pour tous les formats ; téléchargez le fichier si l’aperçu est indisponible.

Dans l’éditeur du projet, cliquez sur une image ou sur le nom d’un bloc fichier pris en charge pour ouvrir le même lecteur sur toute la fenêtre que pour les pièces jointes des tickets. Markdown (`.md`), texte brut (`.txt`, `.text`), CSV, PDF et formats audio ou vidéo compatibles s’ouvrent dans des conteneurs dédiés. Utilisez Fermer ou Échap pour revenir à la page. Le menu Actions du fichier (`…`) propose Télécharger ; Retirer apparaît uniquement dans une page modifiable et retire le bloc du document. Le bloc fichier conserve aussi sa commande Télécharger directe. Les formats non pris en charge, les liens de fichiers externes et les blocs fichiers des pages publiées conservent leur téléchargement. Les images publiées utilisent le lecteur sans action de retrait.

![Lecteur CSV sur toute la fenêtre avec des tâches de projet d’exemple, un grand bouton Fermer et le menu Actions du fichier proposant Télécharger et Retirer.](/documentation/fr/file-preview.png)

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

Ouvrez la page en tant que propriétaire ou Membre, puis ses commandes de publication. Relisez contenu et pièces jointes. Choisissez privé, protégé par mot de passe ou public. Le mot de passe exige au moins huit caractères et s’applique après envoi ; sélectionner le mode seul ne crée pas de lien protégé.

Copiez le lien /p/ après réussite. Si la page a des descendants, examinez l’option d’inclusion des enfants et leur nombre. L’inclusion publie la branche choisie ; l’exclusion laisse leur contenu hors de cette publication. Une base publiée sans ses enfants ne révèle pas automatiquement tous les corps de ses entrées.

Ouvrez le lien dans une session sans votre compte. Testez mot de passe éventuel, contenu, sous-pages souhaitées et téléchargements. Vous vérifiez ainsi la lecture du visiteur plutôt que vos permissions de membre plus larges.


![Fenêtre de publication avec Privée sélectionné et options par mot de passe ou lien.](/documentation/fr/page-publish.png)

### Révoquer et contrôler {#revoke-page}

Revenez à la publication, choisissez privé et confirmez avec **Dépublier** : l’ancien lien cesse de fonctionner, et republier crée un nouveau lien. Après succès, ouvrez l’ancien lien anonymement pour vérifier le refus d’accès. Les copies ou captures déjà reçues ne peuvent pas être rappelées. Les adresses de téléchargement déjà transmises par une page publiée sont signées pour une durée allant jusqu’à 24 heures. La révocation bloque les nouvelles visites de la page, mais ces adresses peuvent rester valides jusqu’à leur expiration.

Les liens des utilisateurs restent `noindex` et distincts du manuel officiel indexé. Noindex limite la découverte, ce n’est pas un mot de passe. Si un enfant ou fichier est visible à tort, révoquez d’abord, inspectez la branche publiée et retestez avant d’envoyer un lien corrigé. Une référence interne ne donne pas accès aux fichiers d’une page non publiée.

## Exporter ou imprimer une page {#import-export-and-print-pages}

Ouvrez le menu du document, puis Exporter. Choisissez Markdown pour une page (.md) ou une branche (.zip), PDF pour ouvrir la vue d’impression, ou l’archive de base lorsque la page est une base de données. Vérifiez le périmètre proposé avant de confirmer : page, branche et archive de base n’ont pas le même contenu.

Ouvrez l’export pour vérifier titres, encadrés, liens et pièces jointes nécessaires au lecteur. L’action PDF ouvre une vue documentaire lisible. Utilisez les commandes d’impression du navigateur pour imprimer ou enregistrer un PDF. Le menu du document ne propose pas d’importation générale ; les imports pris en charge commencent depuis une base vide, selon la [section d’import des bases](/fr/documentation/databases#import-a-database).


![Menu d’export du document avec Markdown (.md) et Imprimer / PDF.](/documentation/fr/page-export.png)

### Archives de bases et limites {#export-fidelity}

L’archive de base (.zip) comprend la branche : Markdown et CSV, schéma exact et couleurs des options, valeurs, corps, dates de création, sous-pages et octets des fichiers. Importez-la dans une nouvelle base vide pour restaurer la structure. Filtres, classement et colonnes masquées propres à l’appareil restent sur l’appareil initial.

L’export ne transfère ni mots de passe, ni identifiants fournisseurs, ni abonnements. Pour déplacer le travail du compte entre instances, consultez le [guide du transfert des données](/fr/documentation/transfer-between-instances). Si un format importé ne conserve pas un bloc ou une propriété externe, vérifiez le résultat avant de remplacer l’original. Ne supprimez pas la source simplement parce qu’un téléchargement existe.


## Routines pour les nouvelles entrées {#entry-routines}

Le propriétaire du projet peut choisir cette base comme déclencheur dans [Routines](/docs/scheduled-routines#conditions). Les conditions utilisent les propriétés typées de l’entrée. Une entrée vide peut attendre que ses propriétés soient remplies. Création, duplication, import de base et déplacement autorisé vers la base comptent comme arrivées ; une restauration n’en crée pas. Supprimer une propriété référencée ou changer son type nécessite de corriger le filtre de la routine.
