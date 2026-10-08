---
{
  "id": "git-accounts-and-repositories",
  "locale": "fr",
  "title": "Connecter Git et lier un dépôt au projet",
  "summary": "Autoriser le compte fournisseur, puis faire sélectionner le dépôt par le propriétaire.",
  "topic": "Numo et intégrations",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "N10"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "content/knowledge/integrations.md",
      "components/settings/account-git-connections-section.tsx",
      "components/settings/project-git-section.tsx",
      "docs/managed-forge-relay-plan.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "forge-issue-sync",
    "feedback-ingestion-and-sso"
  ],
  "aliases": [
    "integrations"
  ],
  "tags": [],
  "figures": [
    {
      "id": "git-accounts-and-repositories-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/git-accounts-and-repositories-workflow.png",
      "alt": "Comptes GitHub et GitLab déconnectés avec leurs boutons d’autorisation.",
      "caption": "Autorisez d’abord votre compte Git. Le propriétaire relie ensuite le repository au projet.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "git-accounts-and-repositories-project-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/git-accounts-and-repositories-project-workflow.png",
      "alt": "Réglages Git d’un projet sans repository lié.",
      "caption": "Réglages Git d’un projet sans repository lié. Autorisez GitHub ou GitLab avant de choisir un repository.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "git-accounts-and-repositories-workflow",
    "git-accounts-and-repositories-project-workflow"
  ]
}
---

## Connexion du compte et lien du projet {#git-accounts-and-repositories}
Dans les paramètres Git du compte, connectez GitHub ou GitLab et terminez l’autorisation dans le navigateur. Accordez seulement les dépôts nécessaires. Sur desktop, revenez à l’application après le navigateur. La connexion se réutilise entre projets, sans lier automatiquement tous les dépôts.

Le propriétaire ouvre la section Git des paramètres du projet, sélectionne un dépôt disponible et confirme. Vérifiez fournisseur, nom complet du dépôt et compte d’action affiché. Les membres ne peuvent pas remplacer ce lien réservé au propriétaire. Il fournit le contexte du dépôt et le travail de code côté serveur ; la synchronisation des tickets a un interrupteur distinct.

![Comptes GitHub et GitLab déconnectés avec leurs boutons d’autorisation.](/documentation/fr/git-accounts-and-repositories-workflow.png)


## Dépôt absent ou accès expiré {#recovery}
Si la liste est vide, vérifiez les permissions et l’autorisation de l’organisation ou du dépôt voulu. Reconnectez un compte expiré plutôt que de placer des jetons dans les tickets. La suppression du lien nécessite le propriétaire ; lisez la confirmation.

Une instance self-hosted peut utiliser le relais géré configuré ou les applications propres à l’opérateur. La connexion au relais est explicite et ne rend pas le fournisseur local. La disponibilité dépend de la configuration. Vérifiez la politique de l’opérateur avant d’autoriser.

![Réglages Git d’un projet sans repository lié.](/documentation/fr/git-accounts-and-repositories-project-workflow.png)
