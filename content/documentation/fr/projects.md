---
{
  "id": "projects",
  "locale": "fr",
  "title": "Projets et membres",
  "summary": "Configurez un projet, invitez des collaborateurs et gérez les membres avec les permissions requises.",
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
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx",
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "components/project-members.tsx",
      "lib/server/update-project.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
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
      "revision": 6,
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
      "revision": 6,
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

Un projet rassemble les tickets, les objectifs, les pages et ses membres. Le propriétaire gère les réglages administratifs et les invitations ; les membres travaillent sur son contenu et peuvent quitter le projet. Les sections suivantes expliquent la configuration du projet et la résolution des problèmes d’invitation.

## Configurer un projet {#project-settings}

Ouvrez le projet, puis ses réglages. Le propriétaire contrôle les paramètres administratifs. Les membres peuvent consulter la section générale et quitter le projet, mais ne disposent pas des commandes de modification du propriétaire.

En tant que propriétaire, saisissez un nom non vide et une clé valide, puis enregistrez. La clé est normalisée en majuscules et comporte 2 à 5 lettres ASCII. Vérifiez les identifiants obtenus après sa modification. Les commandes d’icône et d’apparence distinguent le projet dans la navigation ; elles ne modifient pas ses membres.

Les autres sections gèrent collaborateurs, récurrences, Git, import, intégrations, automatisation et retours. Consultez le guide correspondant avant d’activer un fournisseur ou du travail automatique. Les préférences du compte, comme la langue de votre interface, restent distinctes de la configuration du projet.


![Paramètres généraux du projet avec nom, clé, icône et action distincte de mise à la corbeille.](/documentation/fr/project-general.png)

### Quitter ou supprimer {#project-removal}

Un membre peut quitter le projet pour retirer son propre accès. Le propriétaire devra l’inviter de nouveau si nécessaire. Quitter un projet ne le supprime pas pour les autres.

La suppression du projet est une action du propriétaire dans la zone de danger. Lisez les conséquences et la confirmation avant de l’utiliser, notamment si le projet contient tickets, pages, fichiers ou intégrations. Si une sauvegarde ordinaire échoue, conservez vos valeurs, lisez l’erreur et actualisez le projet avant de réessayer. Ne répétez pas une action destructive dont le premier résultat est incertain.

## Inviter des personnes dans un projet {#project-members}

Le propriétaire gère les membres dans les réglages du projet. Demandez à la personne l’e-mail qu’elle utilise sur cette instance, envoyez l’invitation et vérifiez son état en attente. La même adresse sur une autre instance ne donne pas accès ici.

La personne invitée se connecte avec ce compte et ouvre la boîte de réception. Elle accepte l’invitation pour rejoindre le projet ou la refuse si elle est inattendue. Le dialogue de premier démarrage aide à transmettre son e-mail au propriétaire ; il ne permet pas de rejoindre un projet sans invitation.


![Invitation par email et trois membres de démonstration, avec le propriétaire identifié.](/documentation/fr/project-members.png)

### Responsabilités et permissions {#member-permissions}

| Personne | Accès habituel au projet |
| --- | --- |
| Membre | Tickets, pages et collaboration du projet ; préférences de son compte. |
| Propriétaire | Parcours d’un membre, plus réglages du projet, invitations et configurations d’intégration ou d’automatisation réservées au propriétaire. |
| Visiteur d’un lien public | Contenu explicitement publié par ce lien, sans adhésion au projet. |

Examinez la liste avant de retirer un membre. La ligne du propriétaire ne propose pas de retrait et ces commandes ne transfèrent pas la propriété du projet. Le propriétaire peut annuler une invitation en attente avant son acceptation ; cet état ne révèle pas si l’adresse possède déjà un compte. Le retrait arrête l’accès lié à l’adhésion ; il ne rappelle pas les exports, captures ou copies déjà reçus. Les identifiants Git, IA et MCP restent personnels et ne sont pas transférés par un simple changement de propriétaire.

### Invitation ou accès absent {#invitation-recovery}

Comparez l’adresse invitée avec le compte connecté et vérifiez l’URL de l’instance. Demandez au propriétaire de contrôler les invitations en attente plutôt que de créer plusieurs comptes. Si les permissions changent pendant une session, rechargez la destination et vérifiez l’adhésion avant de réessayer une modification. Ne partagez pas la session d’une autre personne pour contourner un refus d’accès.
