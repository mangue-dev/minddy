---
{
  "id": "forge-issue-sync",
  "locale": "fr",
  "title": "Synchroniser les tickets du fournisseur Git",
  "summary": "Activer import et synchronisation, puis diagnostiquer permissions et modifications concurrentes.",
  "topic": "Numo et intégrations",
  "type": "guide",
  "audiences": [
    "owner",
    "integrator"
  ],
  "workflows": [
    "N11"
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
      "docs/github-issue-sync.md",
      "content/knowledge/integrations.md",
      "components/settings/project-git-section.tsx",
      "content/documentation/reviews/forge-controls-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "forge-issue-sync-mapping",
      "kind": "diagram",
      "src": "/documentation/fr/forge-issue-sync-mapping.png",
      "alt": "Parcours de synchronisation GitHub : configuration, contrôle des événements, import et états.",
      "caption": "Les événements GitHub préservent les modifications récentes et évitent les doublons de livraison. Les correspondances GitLab se vérifient séparément.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        720
      ],
      "theme": "neutral"
    },
    {
      "id": "forge-issue-sync-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/forge-issue-sync-workflow.png",
      "alt": "Dépôt GitHub de démonstration lié, avec la synchronisation des issues désactivée.",
      "caption": "Le dépôt de démonstration est lié à GitHub. La synchronisation des issues reste désactivée ; vérifiez la portée et le backlog existant avant de l’activer. Cette capture ne démontre pas un import synchronisé.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1400,
        1000
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "forge-issue-sync-workflow",
    "forge-issue-sync-mapping"
  ]
}
---

## Activer et vérifier {#forge-issue-sync}
Comme propriétaire, ouvrez Git dans les paramètres après liaison du dépôt. Activez la synchronisation avec les permissions d’écriture requises. Les tickets importés arrivent au triage. Vérifiez le rattrapage affiché, puis titre, description et état d’un ticket distant connu.

Les états ouvert et fermé se reflètent dans les deux sens. Pour GitHub, titre et corps deviennent titre et description ; les labels alimentent catégories, priorité et effort reconnus ; le premier assigné lié est retenu et l’échéance du milestone devient celle du ticket. Les commentaires conservent auteur, identité, URL et dates distants. Les relations de blocage exigent les deux tickets dans le même projet importé. Les URL des pièces jointes restent ; leurs octets et les champs GitHub Projects n’ont pas d’équivalent natif.

## Permissions, conflits et désactivation {#recovery}
La GitHub App nécessite Issues en lecture/écriture et les abonnements Issues, Issue comments et Issue dependencies. Les installations existantes doivent accepter les nouveaux droits. Ces correspondances GitHub ne garantissent pas tous les champs GitLab.

Un événement GitHub daté plus ancien ne remplace pas une modification locale récente. Les identifiants de livraison et de commentaires évitent les effets en doublon. Comparez les dates, puis les événements fournisseur et journaux opérateur si le rattrapage manque. Désactivez dans le même réglage réservé au propriétaire ; examinez séparément le travail déjà importé.

![Parcours de synchronisation GitHub : configuration, contrôle des événements, import et états.](/documentation/fr/forge-issue-sync-mapping.png)

![Dépôt GitHub de démonstration lié, avec la synchronisation des issues désactivée.](/documentation/fr/forge-issue-sync-workflow.png)
