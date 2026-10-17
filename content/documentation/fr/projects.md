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
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-685 sidebar context menus; MIN-692 hidden projects; MIN-693 project roles",
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
      "content/documentation/reviews/premerge-de-es-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md",
      "lib/project-key.ts",
      "components/project-context-actions.tsx",
      "components/projects/project-trash-dialog.tsx",
      "content/documentation/reviews/min-685-sidebar-context-actions.md",
      "components/settings/project-visibility-section.tsx",
      "components/settings/account-hidden-projects-section.tsx",
      "lib/use-hidden-projects.ts",
      "lib/server/hidden-projects.ts",
      "content/documentation/reviews/min-692-hidden-projects.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (MIN-685 sidebar context menu source review inherited from en revision 7; fr translation of added passages; no operational rerun); agent:/root (MIN-692 hidden-project source, route and unit-test review; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root (fr translation of MIN-685 added passages with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance); agent:/root (fr MIN-692 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root/min693_fr with agent:/root (fr MIN-693 translation of the changed passages, localized labels and retained-meaning review; agent review, not human acceptance)",
    "date": "2026-10-17"
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
      "alt": "Paramètres généraux du projet avec nom, clé, icône et action distincte de mise à la corbeille.",
      "caption": "Vérifiez le nom et la clé avant d’enregistrer. La mise à la corbeille reste une action distincte.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        563
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/project-members.png",
      "alt": "Invitation par email et trois membres de démonstration, avec le propriétaire identifié.",
      "caption": "Invitez par l’adresse du compte et identifiez le propriétaire avant de retirer l’accès d’un membre.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        503
      ],
      "theme": "light",
      "padding": 24
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

En tant que propriétaire, saisissez un nom non vide et une clé valide, puis enregistrez. La clé est normalisée en majuscules et comporte 2 à 5 lettres ASCII. Vérifiez les identifiants obtenus après sa modification. Les commandes d’icône et d’apparence distinguent le projet dans la navigation ; elles ne modifient pas ses membres.

Les autres sections gèrent collaborateurs, récurrences, Git, import, intégrations, automatisation et retours. Consultez le guide correspondant avant d’activer un fournisseur ou du travail automatique. Les préférences du compte, comme la langue de votre interface, restent distinctes de la configuration du projet.


![Paramètres généraux du projet avec nom, clé, icône et action distincte de mise à la corbeille.](/documentation/fr/project-general.png)

### Masquer un projet pour vous {#hide-project}

Masquez un projet que vous ne suivez plus au quotidien pour le retirer de votre barre latérale et de votre accueil sans le quitter. Dans les réglages généraux du projet, choisissez **Masquer** sous **Visibilité pour vous**, ou faites un clic droit sur le projet dans la barre latérale et choisissez **Masquer le projet**. Toute personne du projet peut le masquer, y compris le propriétaire et les lecteurs.

Le masquage ne modifie que votre propre navigation. La préférence est enregistrée sur votre compte : vous la retrouvez après une reconnexion et sur vos autres appareils. Vous conservez votre accès et pouvez toujours ouvrir et modifier le projet depuis un lien direct ou depuis **Paramètres du compte** → **Préférences** → **Projets masqués**. Les autres membres voient toujours le projet, et ses routines, intégrations et notifications continuent de fonctionner. Ouvrir un projet masqué ne le réaffiche pas dans votre barre latérale.

Pour le retrouver, choisissez **Réafficher** dans **Projets masqués** ou dans les réglages généraux du projet, ou choisissez **Réafficher le projet** dans son menu de la barre latérale. Si la modification ne peut pas être enregistrée, une erreur s’affiche et le projet revient à son état précédent ; réessayez. Contrairement au départ ou à la mise à la corbeille, le masquage ne retire jamais d’accès ni de contenu.

### Quitter ou supprimer {#project-removal}

Un membre ou un lecteur peut quitter le projet pour retirer son propre accès. Le propriétaire devra l’inviter de nouveau si nécessaire. Quitter un projet ne le supprime pas pour les autres. Le propriétaire ne peut pas quitter le projet : [transférez d’abord la propriété](#transfer-ownership) à un membre.

La suppression du projet est une action du propriétaire dans la zone de danger. Lisez les conséquences et la confirmation avant de l’utiliser, notamment si le projet contient tickets, pages, fichiers ou intégrations. Si une sauvegarde ordinaire échoue, conservez vos valeurs, lisez l’erreur et actualisez le projet avant de réessayer. Ne répétez pas une action destructive dont le premier résultat est incertain.

Le propriétaire peut aussi faire un clic droit sur le projet dans la barre latérale et choisir **Déplacer vers la corbeille**. La même confirmation apparaît, et seul le projet sur lequel vous avez cliqué est concerné.

## Inviter des personnes dans un projet {#project-members}

Le propriétaire gère les membres dans **Paramètres du projet** → **Membres**. Demandez à la personne l’e-mail qu’elle utilise sur cette instance, choisissez son rôle, envoyez l’invitation et vérifiez son état en attente. Choisissez **Membre** pour une personne qui travaille sur le projet, ou **Lecteur** pour une personne qui se contente de le suivre. Pour un lecteur, activez **Peut commenter** s’il doit participer aux discussions. Tant que l’invitation est en attente, le propriétaire peut modifier son rôle et l’option de commentaire. La même adresse sur une autre instance ne donne pas accès ici.

La personne invitée se connecte avec ce compte et ouvre la boîte de réception. Elle accepte l’invitation pour rejoindre le projet avec le rôle qu’elle prévoit, ou la refuse si elle est inattendue. Le dialogue de premier démarrage aide à transmettre son e-mail au propriétaire ; il ne permet pas de rejoindre un projet sans invitation.


![Invitation par email et trois membres de démonstration, avec le propriétaire identifié.](/documentation/fr/project-members.png)

### Rôles de propriétaire, de membre et de lecteur {#member-permissions}

| Rôle | Accès au projet |
| --- | --- |
| Propriétaire | Un seul par projet. Tout ce que peut faire un membre, plus les réglages du projet, les invitations et les rôles, les intégrations, la liaison Git, les routines, le transfert de propriété et la suppression du projet. |
| Membre | Tout le travail sur le contenu : tickets, plans, objectifs, retours, pages et bases de données, commentaires, fichiers, vues partagées et liens de publication, actions Git et pull requests, Numo et MCP. Peut quitter le projet. |
| Lecteur | Lit le contenu, les membres et les routines du projet. Peut masquer le projet, apparaître parmi les personnes qui consultent une page, utiliser ses vues personnelles et ses notifications, et quitter le projet. Ne peut pas modifier le contenu, recevoir une assignation, être responsable d’un objectif ni publier de liens, et ne voit ni les intégrations ni les jetons de partage et de board. |
| Lecteur avec **Peut commenter** | L’accès d’un lecteur, plus les commentaires sur les tickets, les objectifs, les fils de discussion internes des retours et les pages : réponses, mentions, fichiers joints à ses propres commentaires, modification ou suppression de ses propres commentaires. Les réponses publiques sur le board de retours ainsi que les commentaires et réactions sur les pull requests restent indisponibles. |
| Visiteur d’un lien public | Contenu explicitement publié par ce lien, sans adhésion au projet. |

Les lecteurs comptent comme les membres dans la limite d’invités par projet de l’offre, tout comme les invitations en attente. Il n’y a pas de facturation par siège.

Examinez la liste avant de retirer un membre. La ligne du propriétaire ne propose pas de retrait ; seul un [transfert](#transfer-ownership) change le propriétaire. Le propriétaire peut annuler une invitation en attente avant son acceptation ; cet état ne révèle pas si l’adresse possède déjà un compte. Le retrait arrête l’accès lié à l’adhésion ; il ne rappelle pas les exports, captures ou copies déjà reçus. Les identifiants Git, IA et MCP restent personnels et ne sont pas transférés par un simple changement de propriétaire.

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
