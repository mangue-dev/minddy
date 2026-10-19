---
{
  "id": "first-project",
  "locale": "fr",
  "title": "Premiers pas",
  "summary": "Créez ou rejoignez un projet, décrivez une tâche et clôturez-la après avoir vérifié son résultat.",
  "topic": "Premiers pas",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-19",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-689 project creation invitations",
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
      "components/sidebar-onboarding.tsx",
      "app/(app)/home/page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/project-key.ts",
      "components/create-issue-dialog.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts",
      "content/documentation/reviews/second-pass-workflows-2026-10-10.md",
      "content/documentation/reviews/min-689-project-invitations.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (MIN-689 project creation invitations: source and unit-test review of the wizard's optional members step, the invitees saved with the project draft and the invitations sent after Finish (components/create-project-wizard.tsx, lib/project-draft.ts and their tests); no browser walkthrough, no new captures; first-project-steps retained because it does not show the wizard)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (fr translation of the MIN-689 passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-19"
  },
  "related": [
    "accounts",
    "projects",
    "issues"
  ],
  "aliases": [
    "core-tracker"
  ],
  "tags": [
    "Terminer votre premier ticket"
  ],
  "figures": [
    {
      "id": "first-project-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/reader-first-project.png",
      "alt": "Ticket de démonstration terminé, avec description et commentaire enregistré.",
      "caption": "L’état terminé correspond au contrôle du parcours applicatif. Il ne signifie pas que le lien e-mail du site d’exemple a été testé.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "first-project-steps"
  ]
}
---

## Du projet au ticket terminé {#first-project}

Utilisez un compte sur l’instance souhaitée. Dans cet exemple, créez un projet de démonstration pour un site web et un ticket pour vérifier son lien de contact. Le parcours est identique dans le Cloud et sur une instance auto-hébergée configurée ; l’IA n’est pas nécessaire.

Si votre équipe possède déjà un projet, donnez votre e-mail au propriétaire et acceptez son invitation dans la boîte de réception plutôt que de créer un doublon.

1. Après connexion, ouvrez l’accueil et choisissez Nouveau projet dans la navigation. Dans l’assistant, choisissez un projet entièrement nouveau, puis indiquez un nom et une clé de 2 à 5 lettres. Gardez l’icône par défaut et aucun dépôt pour cet exemple manuel. Vous pouvez laisser le brief initial vide.
2. L’assistant propose ensuite d’inviter votre équipe. Choisissez Passer pour cet exemple manuel ; pour travailler à plusieurs, ajoutez plutôt les adresses e-mail de vos collaborateurs. Rien n’est envoyé avant que vous choisissiez Terminer.
3. À la dernière étape, examinez Smart Assign et l’attribution automatique. Laissez l’attribution automatique désactivée si vous voulez attribuer vous-même le ticket de démonstration. Choisissez Terminer, attendez la création et ouvrez le projet obtenu.
4. Ouvrez le projet et créez un ticket. Choisissez un titre concret, par exemple « Vérifier le lien de contact du site ». Décrivez la page, la destination attendue et la vérification à effectuer. Si le bouton Smart-fill est affiché et activé, désactivez-le pour cet exemple manuel avant de créer le ticket. Il contrôle le remplissage de ce ticket et reste indépendant des réglages d’automatisation et de Smart Assign du projet.
5. Ajoutez un responsable, une priorité et un effort si ces propriétés facilitent la planification. Confirmez la création, puis ouvrez le ticket obtenu pour vérifier son projet et son identifiant.
6. Passez le ticket en cours lorsque le travail commence. Effectuez la vérification, puis notez le résultat dans un commentaire. Utilisez l’état de revue si quelqu’un doit encore l’inspecter.
7. Passez le ticket à terminé après avoir vérifié le résultat attendu. Retrouvez-le dans le travail terminé du projet ou par son identifiant pour confirmer le changement.

![Ticket de démonstration terminé, avec description et commentaire enregistré.](/documentation/fr/reader-first-project.png)

## Résoudre un résultat inattendu {#first-use-recovery}

Une invitation concerne un compte et une instance précis. Si elle manque, vérifiez l’adresse fournie au propriétaire et ouvrez la boîte de réception de cette même instance. Connaître le nom d’un projet ne permet pas de le rejoindre. Si un ticket disparaît du tableau après un changement d’état, retirez les filtres ou recherchez son identifiant avant d’en créer un autre.

Si certaines invitations ajoutées dans l’assistant n’ont pas pu partir, le projet est tout de même créé et une notification indique chaque adresse non invitée avec la raison. Vérifiez les invitations en attente dans les paramètres des membres du projet avant d’inviter à nouveau.

Sur mobile, ouvrez le menu de navigation pour atteindre le projet et ses commandes de tickets. Les sélecteurs d’état et de propriétés permettent le même travail sans raccourci desktop. Conservez les décisions durables dans une page liée au ticket lorsqu’elles sont nécessaires à la tâche.
