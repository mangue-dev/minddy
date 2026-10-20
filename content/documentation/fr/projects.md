---
{
  "id": "projects",
  "locale": "fr",
  "title": "Projets et membres",
  "summary": "Configurez un projet, invitez des collaborateurs, choisissez leurs rôles et transférez la propriété.",
  "topic": "Premiers pas",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "S05",
    "S06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 14,
  "sourceRevision": 14,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
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
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx",
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "components/project-members.tsx",
      "lib/server/update-project.ts",
      "lib/project-key.ts",
      "components/project-context-actions.tsx",
      "components/projects/project-trash-dialog.tsx",
      "components/settings/project-visibility-section.tsx",
      "components/settings/account-hidden-projects-section.tsx",
      "lib/use-hidden-projects.ts",
      "lib/server/hidden-projects.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/settings/project-identity-header.tsx",
      "components/settings/inline-edit-field.tsx",
      "components/project-categories.tsx",
      "components/settings/project-settings-page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/members-api.ts",
      "lib/server/collaborators.ts",
      "lib/collaborator-search.ts",
      "components/collaborator-suggestions.tsx",
      "app/api/me/collaborators/route.ts",
      "components/ui/confirm-delete-dialog.tsx"
    ]
  },
  "review": {
    "revision": 14,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 2 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "issues",
    "git",
    "trash-and-recovery",
    "notifications-and-inbox",
    "permissions-and-public-links"
  ],
  "aliases": [
    "project-settings",
    "project-members"
  ],
  "tags": [
    "Configurer un projet",
    "Inviter des personnes dans un projet"
  ],
  "figures": [
    {
      "id": "project-settings-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/project-general.png",
      "alt": "En-tête du projet avec l’icône et son badge de modification, le nom, la clé et les chiffres Tickets, Membres, Objectifs, Catégories et Créé en.",
      "caption": "Sélectionnez l’icône, le nom ou la clé pour les changer sur place ; la mise à la corbeille reste une action distincte, plus bas.",
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        816,
        359
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/project-members.png",
      "alt": "Carte « Inviter des personnes » au-dessus de la carte Membres, qui liste trois membres de démonstration avec le propriétaire identifié.",
      "caption": "Invitez par l’adresse du compte et identifiez le propriétaire avant de retirer l’accès d’un membre.",
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        816,
        430
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "project-settings-steps",
    "project-members-steps"
  ]
}
---

Un projet rassemble les tickets, les objectifs, les pages et les personnes qui y travaillent. Son unique propriétaire gère les réglages administratifs, les invitations et les rôles. Les membres travaillent sur son contenu et les lecteurs le suivent ; les uns comme les autres peuvent quitter le projet. Les sections suivantes expliquent comment configurer le projet, choisir qui peut faire quoi, transférer la propriété ou résoudre un problème d’invitation.

## Configurer un projet {#project-settings}

Ouvrez le projet, puis ses réglages. Le propriétaire contrôle les paramètres administratifs. Les membres et les lecteurs peuvent consulter la section générale, masquer le projet pour eux-mêmes et le quitter, mais ne disposent pas des commandes de modification du propriétaire.

L’onglet **Général** s’ouvre sur l’identité du projet : son icône, son nom et sa clé, puis cinq chiffres : **Tickets**, **Membres**, **Objectifs**, **Catégories** et **Créé en**. En tant que propriétaire, vous modifiez l’icône, le nom et la clé là où ils s’affichent ; il n’y a plus de bouton Enregistrer. Sélectionnez l’icône et choisissez **Nouvelle orbe** (proposée seulement tant qu’aucune image ne couvre l’orbe), **Importer une image**, **Importer depuis un site…**, qui demande l’adresse du site et importe son icône quand vous choisissez **Importer**, ou, si une image est définie, **Retirer l’image**, qui demande d’abord une confirmation, car l’image est supprimée. Sélectionnez le nom ou la clé pour les modifier : sur ordinateur, ils deviennent un champ où Entrée ou la sortie du champ enregistre et Échap annule ; sur téléphone, une feuille s’ouvre avec **Enregistrer**. Le nom ne peut pas être vide. La clé est normalisée en majuscules et doit compter 2 à 5 lettres (A–Z) ; sinon une erreur s’affiche et la clé n’est pas enregistrée. Vérifiez les identifiants obtenus après sa modification. L’icône sert seulement à distinguer le projet dans la navigation ; elle ne modifie pas ses membres. Les membres et les lecteurs voient le même en-tête, sans ces commandes.

Les autres onglets sont **Catégories**, **Membres**, **Récurrences**, **Smart Assign**, **Retours**, **Git**, **Import** et **Intégrations**. Consultez le guide correspondant avant d’activer un fournisseur ou du travail automatique. Les préférences du compte, comme la langue de votre interface, restent distinctes de la configuration du projet.

Dans **Catégories**, le propriétaire et les membres gèrent les catégories qui classent les tickets. Choisissez **Nouvelle catégorie** sur la ligne de titre de la carte : une ligne avec une pastille de couleur et un champ de nom apparaît en haut de la liste. Appuyez sur Entrée ou choisissez **Ajouter** pour créer la catégorie ; Échap referme la ligne sans la créer. Sélectionnez la pastille d’une catégorie pour choisir une autre couleur, appliquée aussitôt (sur téléphone, les couleurs s’ouvrent dans une feuille), ou sélectionnez son nom pour la renommer sur place. Le bouton de suppression demande une confirmation, puis retire la catégorie de tous les tickets.


![En-tête du projet avec l’icône et son badge de modification, le nom, la clé et les chiffres Tickets, Membres, Objectifs, Catégories et Créé en.](/documentation/fr/project-general.png)

### Masquer un projet pour vous {#hide-project}

Masquez un projet que vous ne suivez plus au quotidien pour le retirer de votre barre latérale et de votre accueil sans le quitter. Dans les réglages généraux du projet, choisissez **Masquer** dans la **Zone sensible**, ou faites un clic droit sur le projet dans la barre latérale et choisissez **Masquer le projet**, puis confirmez. Dans les deux cas, une boîte de dialogue qui nomme le projet demande une confirmation, car il quitte votre navigation ; le réafficher ne demande aucune confirmation. Toute personne du projet peut le masquer, y compris le propriétaire et les lecteurs.

Le masquage ne modifie que votre propre navigation. La préférence est enregistrée sur votre compte : vous la retrouvez après une reconnexion et sur vos autres appareils. Vous conservez votre accès et pouvez toujours ouvrir et modifier le projet depuis un lien direct ou depuis l’onglet **Projets masqués** des **Paramètres du compte**. Les autres membres voient toujours le projet, et ses routines, intégrations et notifications continuent de fonctionner. Ouvrir un projet masqué ne le réaffiche pas dans votre barre latérale.

Pour le retrouver, choisissez **Réafficher** dans **Projets masqués** ou dans les réglages généraux du projet, ou choisissez **Réafficher le projet** dans son menu de la barre latérale. Si la modification ne peut pas être enregistrée, une erreur s’affiche et le projet revient à son état précédent ; réessayez. Contrairement au départ ou à la mise à la corbeille, le masquage ne retire jamais d’accès ni de contenu.

### Quitter ou supprimer {#project-removal}

Un membre ou un lecteur peut choisir **Quitter** dans la zone sensible pour retirer son propre accès ; une boîte de dialogue qui nomme le projet lui demande d’abord de confirmer. Le propriétaire devra l’inviter de nouveau si nécessaire. Quitter un projet ne le supprime pas pour les autres. Le propriétaire ne peut pas quitter le projet : [transférez d’abord la propriété](#transfer-ownership) à un membre.

Retirer le projet est une action du propriétaire : dans la zone sensible, choisissez **Déplacer vers la corbeille** à côté de **Déplacer le projet vers la corbeille**. La confirmation nomme le projet et indique que ses tickets, objectifs et retours partent avec lui ; le projet reste restaurable depuis la [corbeille](/fr/documentation/trash-and-recovery) pendant 30 jours, et sa clé est libérée aussitôt. Lisez la confirmation avant de l’utiliser, notamment si le projet contient tickets, pages, fichiers ou intégrations. Si une sauvegarde ordinaire échoue, conservez vos valeurs, lisez l’erreur et actualisez le projet avant de réessayer. Ne répétez pas une action destructive dont le premier résultat est incertain.

Le propriétaire peut aussi faire un clic droit sur le projet dans la barre latérale et choisir **Déplacer vers la corbeille**. La même confirmation apparaît, et seul le projet sur lequel vous avez cliqué est concerné.

## Inviter des personnes dans un projet {#project-members}

Le propriétaire gère les membres dans **Paramètres du projet** → **Membres**. Dans la carte **Inviter des personnes**, cherchez un nom ou saisissez l’e-mail que la personne utilise sur cette instance. Pendant la saisie, **De vos projets** propose les personnes qui ont déjà rejoint l’un de vos autres projets, comme propriétaire, membre ou lecteur, avec un e-mail vérifié ; une personne seulement invitée n’est jamais proposée, pas plus que les membres actuels et les invitations en attente. Choisissez une personne pour la placer dans le champ avec son avatar et son nom, ou appuyez sur Entrée quand le nom ne correspond qu’à une seule personne. Toute autre personne est invitée par e-mail. Choisissez ensuite son rôle, puis **Inviter**. Une personne choisie parmi vos projets est invitée par son compte : Minddy vérifie de nouveau qu’elle a rejoint l’un de vos projets et refuse sinon avec « Cette personne ne fait pas partie de vos projets. » L’invitation figure dans la carte **Invitations en attente** jusqu’à son acceptation ; les membres actuels sont listés dans la carte **Membres**, dont le titre indique leur nombre. Choisissez **Membre** pour une personne qui travaille sur le projet, ou **Lecteur** pour une personne qui se contente de le suivre. Pour un lecteur, activez **Peut commenter** s’il doit participer aux discussions. Tant que l’invitation est en attente, le propriétaire peut modifier son rôle et l’option de commentaire. La même adresse sur une autre instance ne donne pas accès ici.

La personne invitée se connecte avec ce compte et ouvre la boîte de réception. Elle accepte l’invitation pour rejoindre le projet avec le rôle qu’elle prévoit, ou la refuse si elle est inattendue. Le dialogue de premier démarrage aide à transmettre son e-mail au propriétaire ; il ne permet pas de rejoindre un projet sans invitation.

Vous pouvez aussi inviter des personnes en créant le projet. À l’étape **Invitez votre équipe** de l’assistant, cherchez un nom ou saisissez un e-mail. Sous le champ, **De vos projets** propose les mêmes personnes que la carte **Inviter des personnes**, avant même la saisie, et se filtre pendant la saisie. Choisissez une personne, ou appuyez sur Entrée quand une seule correspond ; saisir l’adresse d’une de ces personnes l’ajoute aussi par son nom. Ajoutez toute autre personne par e-mail avec **Ajouter** ou Entrée. La limite d’invités de votre plan s’applique comme ici, et la liste est conservée avec le brouillon du projet si vous reprenez la création plus tard.

Rien n’est envoyé avant que vous choisissiez **Terminer** : le projet est d’abord créé, puis chaque personne reçoit une invitation avec le rôle **Membre**. Les personnes choisies parmi vos projets sont invitées par leur compte : Minddy vérifie de nouveau qu’elles ont rejoint l’un de vos projets et utilise leur adresse vérifiée. Les autres sont invitées par e-mail. Ces invitations figurent dans la carte **Invitations en attente**, où vous pouvez modifier leur rôle, et s’acceptent dans la boîte de réception comme les autres. Si certaines sont refusées, par exemple à cause de la limite d’invités du plan ou parce qu’une personne a quitté entre-temps le projet que vous partagiez (« Cette personne ne fait pas partie de vos projets. »), les autres partent quand même et une notification indique chaque personne non invitée avec la raison. Vérifiez la carte **Invitations en attente** avant de les inviter à nouveau. Une invitation en attente est enregistrée, ce qui ne garantit pas que son e-mail a été remis.


![Carte « Inviter des personnes » au-dessus de la carte Membres, qui liste trois membres de démonstration avec le propriétaire identifié.](/documentation/fr/project-members.png)

### Rôles de propriétaire, de membre et de lecteur {#member-permissions}

| Rôle | Accès au projet |
| --- | --- |
| Propriétaire | Un seul par projet. Tout ce que peut faire un membre, plus les réglages du projet, les invitations et les rôles, les intégrations, la liaison Git, les routines, le transfert de propriété et la suppression du projet. |
| Membre | Tout le travail sur le contenu : tickets, plans, objectifs, retours, pages et bases de données, commentaires, fichiers, vues partagées et liens de publication, actions Git et pull requests, Numo et MCP. Peut quitter le projet. |
| Lecteur | Lit le contenu, les membres et les routines du projet. Peut masquer le projet, apparaître parmi les personnes qui consultent une page, utiliser ses vues personnelles et ses notifications, et quitter le projet. Ne peut pas modifier le contenu, recevoir une assignation, être responsable d’un objectif ni publier de liens, et ne voit ni les intégrations ni les jetons de partage et de board. |
| Lecteur avec **Peut commenter** | L’accès d’un lecteur, plus les commentaires sur les tickets, les objectifs, les fils de discussion internes des retours et les pages : réponses, mentions, fichiers joints à ses propres commentaires, modification ou suppression de ses propres commentaires. Les réponses publiques sur le board de retours ainsi que les commentaires et réactions sur les pull requests restent indisponibles. |
| Visiteur d’un lien public | Contenu explicitement publié par ce lien, sans adhésion au projet. |

Les lecteurs comptent comme les membres dans la limite d’invités par projet de l’offre, tout comme les invitations en attente. Il n’y a pas de facturation par siège.

Examinez la liste avant de retirer un membre. La ligne du propriétaire ne propose pas de retrait ; seul un [transfert](#transfer-ownership) change le propriétaire. Le propriétaire peut annuler une invitation en attente avant son acceptation, après confirmation dans une boîte de dialogue qui nomme l’adresse invitée ; le lien reçu par e-mail cesse alors de fonctionner, et la personne pourra être invitée à nouveau plus tard. L’état en attente ne révèle pas si l’adresse possède déjà un compte. Le retrait arrête l’accès lié à l’adhésion ; il ne rappelle pas les exports, captures ou copies déjà reçus. Les identifiants Git, IA et MCP restent personnels et ne sont pas transférés par un simple changement de propriétaire.

### Changer le rôle d’un membre {#change-role}

En tant que propriétaire, ouvrez **Paramètres du projet** → **Membres** et choisissez le nouveau rôle de la personne : **Membre** ou **Lecteur**. Pour un lecteur, choisissez si **Peut commenter** est activé. Cette option est désactivée par défaut et se désactive chaque fois qu’une personne devient lecteur : vérifiez-la donc après avoir fait passer un membre en Lecteur. Votre propre rôle de propriétaire ne change que par un transfert.

Faire passer un membre en Lecteur retire aussi son assignation de ses tickets ouverts et lui retire la responsabilité de ses objectifs, ce qui sort ces tickets de son cycle personnel. Réassignez ce travail s’il doit se poursuivre.

Un changement de rôle s’applique à la prochaine requête de la personne, dans l’application, dans Numo et via MCP. Le contenu qu’elle a déjà chargé ou téléchargé n’est pas rappelé, et un lien de fichier signé qu’elle a déjà ouvert peut rester valide quelques minutes.

### Invitation ou accès absent {#invitation-recovery}

Comparez l’adresse invitée avec le compte connecté et vérifiez l’URL de l’instance. Demandez au propriétaire de contrôler les invitations en attente plutôt que de créer plusieurs comptes. Si votre rôle change pendant une session, rechargez la destination et vérifiez votre rôle avant de réessayer une modification. Un lecteur qui doit modifier du contenu demande au propriétaire de le faire passer en Membre. Ne partagez pas la session d’une autre personne pour contourner un refus d’accès.

## Transférer la propriété {#transfer-ownership}

Un projet a exactement un propriétaire. Pour le céder, ouvrez **Paramètres du projet** → **Membres** en tant que propriétaire, choisissez **Transférer la propriété du projet** pour un membre existant et confirmez. Seul un Membre peut recevoir la propriété : invitez d’abord la personne ou faites passer un lecteur en Membre. Après le transfert, vous restez dans le projet en tant que Membre.

### Ce qui change avec la propriété {#transfer-effects}

- Vos routines dans ce projet sont mises en pause et ne peuvent plus lancer de nouveau travail. Le nouveau propriétaire crée les routines qui doivent continuer, sur son propre budget.
- Les limites de l’offre en tickets et en invités par projet, le stockage et l’IA de fond comme Smart Assign et la relecture des retours reposent désormais sur l’offre et le budget du nouveau propriétaire. Les tickets et les membres existants sont conservés.
- Les abonnements, les moyens de paiement ainsi que les clés et connexions personnelles restent attachés à chaque compte.
- Les invitations en attente restent valides.

Le transfert échoue sans rien modifier si le stockage du nouveau propriétaire ne peut pas accueillir les fichiers du projet, ou s’il possède déjà un projet avec la même clé. Libérez de l’espace ou changez la clé du projet, puis réessayez.
