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
  "revision": 12,
  "sourceRevision": 12,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-12",
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
      "app/(app)/home/page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/project-key.ts",
      "components/create-issue-dialog.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts",
      "components/first-run/first-run-gate.tsx",
      "components/first-run/onboarding-screen.tsx",
      "lib/use-onboarding.ts",
      "components/wizard/wizard-dialog.tsx",
      "components/import/import-guide.tsx",
      "lib/import-guides.ts",
      "lib/project-seed-handoff.ts"
    ]
  },
  "review": {
    "revision": 12,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 1 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-907 first-run profile page and phone getting-started tour before Home: checked against components/first-run/first-run-gate.tsx, components/first-run/onboarding-screen.tsx and lib/first-run.ts; no browser walkthrough; existing figure kept); agent:claude-code (MIN-907 tour follow-up: skip confirmation, final screen with confetti, Home after the tour and the issue step completed on creation, checked against components/first-run/onboarding-screen.tsx, lib/use-onboarding.ts and messages/*.json; no browser walkthrough; existing figures do not show the tour and were kept); agent:claude-code (MIN-907 project wizard: the origin question, the brief step and the name suggestion are gone; the wizard opens on the name and key, with I want to join a project between Continue and Back; steps in order name, icon, repository, Invite your team, Bring your issues over, Finishing touches; Back is a full button from the second step; the import step offers a tool list, a folded How to export from section and Choose the CSV file, and the import dialog opens on the new project; checked against components/create-project-wizard.tsx, lib/project-draft.ts PROJECT_WIZARD_STEPS, components/wizard/wizard-dialog.tsx, components/import/import-guide.tsx, lib/project-seed-handoff.ts, app/(app)/projects/[id]/page.tsx and messages/*.json; no browser walkthrough; the existing figure shows an issue, not the wizard, and was kept); agent:claude-code (MIN-964 tour on every platform: the new-account paragraph no longer limits the getting-started steps to a phone, and components/sidebar-onboarding.tsx left the evidence; checked against components/first-run/first-run-gate.tsx and components/first-run/onboarding-screen.tsx; no browser walkthrough; no figure recaptured)",
    "language": "agent:claude-code (fr changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-907 new-account paragraph, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-907 tour follow-up skip sentence with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-907 wizard steps, join sentence and import paragraph rewritten, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (fr MIN-964 changed passages on the tour on every platform, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-12"
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
      "alt": "Ticket AUR-3 en cours, avec sa description, son assigné, son effort et sa catégorie.",
      "caption": "Le ticket affiche son identifiant, son statut et ses propriétés. Passez-le à terminé seulement après avoir vérifié le résultat attendu.",
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-11-04",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "first-project-steps"
  ]
}
---

## Du projet au ticket terminé {#first-project}

Utilisez un compte sur l’instance souhaitée. Dans cet exemple, créez un projet de démonstration pour un site web et un ticket pour vérifier son lien de contact. Le parcours est identique dans le Cloud et sur une instance auto-hébergée configurée ; l’IA n’est pas nécessaire.

Si votre équipe possède déjà un projet, donnez votre e-mail au propriétaire et acceptez son invitation dans la boîte de réception plutôt que de créer un doublon. À la première étape de l’assistant, **Je souhaite rejoindre un projet** explique comment rejoindre un projet.

Un nouveau compte demande d’abord votre nom et votre image sur **Comment vous appelle-t-on ?**. Les premiers pas suivent, une page à la fois : créez le projet depuis leur première étape, ou choisissez **Passer l'onboarding**, confirmez, puis suivez cet exemple depuis l’accueil. Consultez [Créer un compte et se connecter](/fr/documentation/accounts#account-access).

1. Après connexion, ouvrez l’accueil et choisissez **Nouveau projet** dans la navigation. L’assistant s’ouvre sur **Comment s'appelle votre projet ?** : indiquez un nom et une clé de 2 à 5 lettres, puis choisissez **Continuer**.
2. Gardez l’icône par défaut sur **Icône du projet** et choisissez **Continuer**. Sur **Relier un dépôt**, choisissez **Passer** pour cet exemple manuel. À partir de la deuxième étape, **Retour**, sous **Continuer**, ramène à l’étape précédente.
3. Sur **Invitez votre équipe**, choisissez **Passer** pour cet exemple manuel ; pour travailler à plusieurs, cherchez plutôt par leur nom les personnes de vos autres projets, ou saisissez leur adresse e-mail. Rien n’est envoyé avant que vous choisissiez **Terminer**.
4. Sur **Récupérez vos tickets**, choisissez **Passer** : cet exemple démarre sans ticket. Pour partir d’un autre outil, consultez le paragraphe qui suit ces étapes.
5. Sur **Finitions**, examinez Smart Assign. Choisissez **Terminer**, attendez la création et ouvrez le projet obtenu.
6. Ouvrez le projet et créez un ticket. Choisissez un titre concret, par exemple « Vérifier le lien de contact du site ». Décrivez la page, la destination attendue et la vérification à effectuer. Si le bouton Smart Fill est affiché et activé, désactivez-le pour cet exemple manuel avant de créer le ticket. Il contrôle le remplissage de ce ticket et reste indépendant de Smart Assign et des routines.
7. Ajoutez un responsable, une priorité et un effort si ces propriétés facilitent la planification. Confirmez la création, puis ouvrez le ticket obtenu pour vérifier son projet et son identifiant.
8. Passez le ticket en cours lorsque le travail commence. Effectuez la vérification, puis notez le résultat dans un commentaire. Utilisez l’état de revue si quelqu’un doit encore l’inspecter.
9. Passez le ticket à terminé après avoir vérifié le résultat attendu. Les tableaux masquent la colonne **Terminé** par défaut : sélectionnez **Terminé** dans le filtre **Statut** du tableau, ou recherchez l’identifiant du ticket, pour confirmer le changement.

Pour récupérer les tickets d’un autre outil, choisissez cet outil dans la liste de **Récupérez vos tickets** : Linear, Jira, Notion, GitHub, Trello ou minddy. **Comment exporter depuis …** déplie les étapes d’export de l’outil choisi. Exportez le CSV depuis cet outil, puis choisissez **Choisir le fichier CSV**. Le fichier choisi s’affiche avec un bouton pour le retirer. Il est importé une fois le projet créé : le projet s’ouvre sur une fenêtre d’import qui contient le fichier, où vous associez les colonnes et confirmez l’import. Un brouillon de l’assistant ne conserve pas le fichier ; si vous reprenez la création plus tard, choisissez-le de nouveau.

![Ticket AUR-3 en cours, avec sa description, son assigné, son effort et sa catégorie.](/documentation/fr/reader-first-project.png)

## Résoudre un résultat inattendu {#first-use-recovery}

Une invitation concerne un compte et une instance précis. Si elle manque, vérifiez l’adresse fournie au propriétaire et ouvrez la boîte de réception de cette même instance. Connaître le nom d’un projet ne permet pas de le rejoindre. Si un ticket disparaît du tableau après un changement d’état, retirez les filtres ou recherchez son identifiant avant d’en créer un autre. Les tickets terminés et annulés quittent le tableau par défaut ; sélectionnez **Terminé** ou **Annulé** dans le filtre **Statut** pour les afficher.

Si certaines invitations ajoutées dans l’assistant n’ont pas pu partir, le projet est tout de même créé et une notification indique chaque personne non invitée avec la raison. Vérifiez les invitations en attente dans les paramètres des membres du projet avant d’inviter à nouveau.

Sur mobile, ouvrez le menu de navigation pour atteindre le projet et ses commandes de tickets. Les sélecteurs d’état et de propriétés permettent le même travail sans raccourci desktop. Conservez les décisions durables dans une page liée au ticket lorsqu’elles sont nécessaires à la tâche.
