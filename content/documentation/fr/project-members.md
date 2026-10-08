---
{
  "id": "project-members",
  "locale": "fr",
  "title": "Inviter des personnes dans un projet",
  "summary": "Utilisez l’e-mail du bon compte, acceptez les invitations et gérez l’accès au projet.",
  "topic": "Premiers pas",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "S06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
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
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "content/knowledge/settings-and-data.md",
      "components/project-members.tsx",
      "lib/server/update-project.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "project-settings",
    "notifications-and-inbox",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/project-members.png",
      "alt": "Invitation par email et trois membres de démonstration, avec le propriétaire identifié.",
      "caption": "Invitez par l’adresse du compte et identifiez le propriétaire avant de retirer l’accès d’un membre.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "project-members-steps"
  ]
}
---

## Envoyer et accepter une invitation {#project-members}

Le propriétaire gère les membres dans les réglages du projet. Demandez à la personne l’e-mail qu’elle utilise sur cette instance, envoyez l’invitation et vérifiez son état en attente. La même adresse sur une autre instance ne donne pas accès ici.

La personne invitée se connecte avec ce compte et ouvre la boîte de réception. Elle accepte l’invitation pour rejoindre le projet ou la refuse si elle est inattendue. Le dialogue de premier démarrage aide à transmettre son e-mail au propriétaire ; il ne permet pas de rejoindre un projet sans invitation.


![Invitation par email et trois membres de démonstration, avec le propriétaire identifié.](/documentation/fr/project-members.png)

## Responsabilités et permissions {#member-permissions}

| Personne | Accès habituel au projet |
| --- | --- |
| Membre | Tickets, pages et collaboration du projet ; préférences de son compte. |
| Propriétaire | Parcours d’un membre, plus réglages du projet, invitations et configurations d’intégration ou d’automatisation réservées au propriétaire. |
| Visiteur d’un lien public | Contenu explicitement publié par ce lien, sans adhésion au projet. |

Examinez la liste avant de retirer un membre. La ligne du propriétaire ne propose pas de retrait et ces commandes ne transfèrent pas la propriété du projet. Le propriétaire peut annuler une invitation en attente avant son acceptation ; cet état ne révèle pas si l’adresse possède déjà un compte. Le retrait arrête l’accès lié à l’adhésion ; il ne rappelle pas les exports, captures ou copies déjà reçus. Les identifiants Git, IA et MCP restent personnels et ne sont pas transférés par un simple changement de propriétaire.

## Invitation ou accès absent {#invitation-recovery}

Comparez l’adresse invitée avec le compte connecté et vérifiez l’URL de l’instance. Demandez au propriétaire de contrôler les invitations en attente plutôt que de créer plusieurs comptes. Si les permissions changent pendant une session, rechargez la destination et vérifiez l’adhésion avant de réessayer une modification. Ne partagez pas la session d’une autre personne pour contourner un refus d’accès.
