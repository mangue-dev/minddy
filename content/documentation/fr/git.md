---
{
  "id": "git",
  "locale": "fr",
  "title": "Dépôts Git et synchronisation des tickets",
  "summary": "Connectez un compte Git, associez un dépôt au projet et configurez la synchronisation des tickets avec son fournisseur.",
  "topic": "Numo et intégrations",
  "type": "guide",
  "audiences": [
    "owner",
    "member",
    "integrator"
  ],
  "workflows": [
    "N10",
    "N11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "docs/github-issue-sync.md",
      "content/documentation/reviews/forge-controls-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "api-and-webhooks"
  ],
  "aliases": [
    "git-accounts-and-repositories",
    "integrations",
    "forge-issue-sync"
  ],
  "tags": [
    "Connecter Git et lier un dépôt au projet",
    "Synchroniser les tickets du fournisseur Git"
  ],
  "figures": [
    {
      "id": "git-accounts-and-repositories-workflow",
      "kind": "diagram",
      "src": "/documentation/fr/git-connection-flow.svg",
      "alt": "La connexion du compte personnel et le lien du dépôt au projet sont deux étapes distinctes.",
      "caption": "Autorisez d’abord le compte, puis reliez un dépôt en tant que propriétaire du projet.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        720,
        580
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Connecter un compte, puis relier un dépôt",
        "items": [
          {
            "title": "Compte Git personnel",
            "detail": "Autorisez GitHub ou GitLab pour les dépôts dont vous avez besoin."
          },
          {
            "title": "Propriétaire du projet",
            "detail": "Choisissez un dépôt disponible dans les réglages Git du projet."
          },
          {
            "title": "Dépôt lié",
            "detail": "Aurora → aurora/web. La synchronisation des tickets est un choix distinct."
          }
        ]
      }
    },
    {
      "id": "forge-issue-sync-mapping",
      "kind": "diagram",
      "src": "/documentation/fr/forge-issue-sync-mapping.svg",
      "alt": "Parcours de synchronisation GitHub : configuration, contrôle des événements, import et états.",
      "caption": "Les événements GitHub préservent les modifications récentes et évitent les doublons de livraison. Les correspondances GitLab se vérifient séparément.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        720
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Synchronisation des tickets GitHub",
        "items": [
          {
            "title": "Configuration du propriétaire",
            "detail": "Relier le repository, autoriser la lecture/écriture Issues et activer la synchronisation."
          },
          {
            "title": "Événements entrants",
            "detail": "Dédupliquer les identifiants de livraison ; rejeter les données plus anciennes que les modifications locales."
          },
          {
            "title": "Import et correspondances",
            "detail": "Les tickets importés entrent au triage. Titre/corps deviennent titre/description ; les labels donnent catégories, priorité et effort reconnus."
          },
          {
            "title": "États synchronisés",
            "detail": "Les états ouvert et fermé se synchronisent dans les deux sens. Comparer les horodatages en cas de modifications concurrentes."
          }
        ],
        "note": "Les commentaires gardent l’identité distante sans duplication. Les correspondances GitLab peuvent différer."
      }
    },
    {
      "id": "forge-issue-sync-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/forge-issue-sync-workflow.png",
      "alt": "Dépôt GitHub de démonstration lié, avec la synchronisation des issues désactivée.",
      "caption": "Le dépôt de démonstration est lié à GitHub. La synchronisation des issues reste désactivée ; vérifiez la portée et le backlog existant avant de l’activer. Cette capture ne démontre pas un import synchronisé.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        278
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "git-accounts-and-repositories-workflow",
    "forge-issue-sync-workflow",
    "forge-issue-sync-mapping"
  ]
}
---

Connecter un compte Git personnel, lier un dépôt au projet et synchroniser les tickets du fournisseur sont des actions distinctes. Autorisez d’abord le compte ; le propriétaire du projet choisit ensuite le dépôt et peut activer la synchronisation avec les permissions requises chez le fournisseur.

## Connecter Git et lier un dépôt au projet {#git-accounts-and-repositories}

Dans les paramètres Git du compte, connectez GitHub ou GitLab et terminez l’autorisation dans le navigateur. Accordez seulement les dépôts nécessaires. Sur desktop, revenez à l’application après le navigateur. La connexion se réutilise entre projets, sans lier automatiquement tous les dépôts.

Le propriétaire ouvre la section Git des paramètres du projet, sélectionne un dépôt disponible et confirme. Vérifiez fournisseur, nom complet du dépôt et compte d’action affiché. Les membres ne peuvent pas remplacer ce lien réservé au propriétaire. Il fournit le contexte du dépôt et le travail de code côté serveur ; la synchronisation des tickets a un interrupteur distinct.

![La connexion du compte personnel et le lien du dépôt au projet sont deux étapes distinctes.](/documentation/fr/git-connection-flow.svg)

### Dépôt absent ou accès expiré {#recovery}

Si la liste est vide, vérifiez les permissions et l’autorisation de l’organisation ou du dépôt voulu. Reconnectez un compte expiré plutôt que de placer des jetons dans les tickets. La suppression du lien nécessite le propriétaire ; lisez la confirmation.

Une instance self-hosted peut utiliser le relais géré configuré ou les applications propres à l’opérateur. La connexion au relais est explicite et ne rend pas le fournisseur local. La disponibilité dépend de la configuration. Vérifiez la politique de l’opérateur avant d’autoriser.


## Synchroniser les tickets du fournisseur Git {#forge-issue-sync}

Comme propriétaire, ouvrez Git dans les paramètres après liaison du dépôt. Activez la synchronisation avec les permissions d’écriture requises. Les tickets importés arrivent au triage. Vérifiez le rattrapage affiché, puis titre, description et état d’un ticket distant connu.

Les états ouvert et fermé se reflètent dans les deux sens. Pour GitHub, titre et corps deviennent titre et description ; les labels alimentent catégories, priorité et effort reconnus ; le premier assigné lié est retenu et l’échéance du milestone devient celle du ticket. Les commentaires conservent auteur, identité, URL et dates distants. Les relations de blocage exigent les deux tickets dans le même projet importé. Les URL des pièces jointes restent ; leurs octets et les champs GitHub Projects n’ont pas d’équivalent natif.

### Permissions, conflits et désactivation {#forge-issue-sync-recovery}

La GitHub App nécessite Issues en lecture/écriture et les abonnements Issues, Issue comments et Issue dependencies. Les installations existantes doivent accepter les nouveaux droits. Ces correspondances GitHub ne garantissent pas tous les champs GitLab.

Un événement GitHub daté plus ancien ne remplace pas une modification locale récente. Les identifiants de livraison et de commentaires évitent les effets en doublon. Comparez les dates, puis les événements fournisseur et journaux opérateur si le rattrapage manque. Désactivez dans le même réglage réservé au propriétaire ; examinez séparément le travail déjà importé.

![Parcours de synchronisation GitHub : configuration, contrôle des événements, import et états.](/documentation/fr/forge-issue-sync-mapping.svg)

![Dépôt GitHub de démonstration lié, avec la synchronisation des issues désactivée.](/documentation/fr/forge-issue-sync-workflow.png)
