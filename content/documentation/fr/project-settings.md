---
{
  "id": "project-settings",
  "locale": "fr",
  "title": "Configurer un projet",
  "summary": "Modifiez son nom, sa clé et son apparence en tant que propriétaire, et distinguez l’accès des membres.",
  "topic": "Premiers pas",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "S05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
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
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "project-members",
    "recurring-issues",
    "git-accounts-and-repositories",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "project-settings-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/project-general.png",
      "alt": "Paramètres généraux du projet avec nom, clé, icône et action distincte de mise à la corbeille.",
      "caption": "Vérifiez le nom et la clé avant d’enregistrer. La mise à la corbeille reste une action distincte.",
      "revision": 1,
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
    "project-settings-steps"
  ]
}
---

## Ouvrir les réglages du projet {#project-settings}

Ouvrez le projet, puis ses réglages. Le propriétaire contrôle les paramètres administratifs. Les membres peuvent consulter la section générale et quitter le projet, mais ne disposent pas des commandes de modification du propriétaire.

En tant que propriétaire, saisissez un nom non vide et une clé valide, puis enregistrez. La clé est normalisée en majuscules et comporte 2 à 5 lettres ASCII. Vérifiez les identifiants obtenus après sa modification. Les commandes d’icône et d’apparence distinguent le projet dans la navigation ; elles ne modifient pas ses membres.

Les autres sections gèrent collaborateurs, récurrences, Git, import, intégrations, automatisation et retours. Consultez le guide correspondant avant d’activer un fournisseur ou du travail automatique. Les préférences du compte, comme la langue de votre interface, restent distinctes de la configuration du projet.


![Paramètres généraux du projet avec nom, clé, icône et action distincte de mise à la corbeille.](/documentation/fr/project-general.png)

## Quitter ou supprimer {#project-removal}

Un membre peut quitter le projet pour retirer son propre accès. Le propriétaire devra l’inviter de nouveau si nécessaire. Quitter un projet ne le supprime pas pour les autres.

La suppression du projet est une action du propriétaire dans la zone de danger. Lisez les conséquences et la confirmation avant de l’utiliser, notamment si le projet contient tickets, pages, fichiers ou intégrations. Si une sauvegarde ordinaire échoue, conservez vos valeurs, lisez l’erreur et actualisez le projet avant de réessayer. Ne répétez pas une action destructive dont le premier résultat est incertain.
