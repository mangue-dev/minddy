---
{
  "id": "automation-settings",
  "locale": "fr",
  "title": "Automatisation des tickets",
  "summary": "Distinguer préférences du compte et règles de projet réservées au propriétaire.",
  "topic": "Compte et applications",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "A05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 5,
  "sourceRevision": 5,
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
      "components/settings/account-automations-section.tsx",
      "components/settings/smart-assign-section.tsx",
      "content/knowledge/settings-and-data.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Configurer le travail automatique des tickets"
  ],
  "figures": [
    {
      "id": "automation-settings-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/automation-settings-workflow.png",
      "alt": "Préréglage d’automatisation sur Aucun.",
      "caption": "Aucun préréglage n’est sélectionné : ce compte ne démarre pas de travail automatique.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        221
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "automation-settings-projects-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/automation-settings-projects-workflow.png",
      "alt": "Choix des projets pour les automatisations du compte.",
      "caption": "Choix des projets pour les automatisations du compte. Les deux projets de démonstration sont désactivés ici ; aucune automatisation ne démarre.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        176
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "automation-settings-workflow",
    "automation-settings-projects-workflow"
  ]
}
---

## Choix d’automatisation du compte {#automation-settings}

Ouvrez la section Automatisations des réglages du compte. Choisissez un préréglage, examinez son explication et l’utilisation estimée, réglez le délai de démarrage et choisissez les tailles d’effort qui autorisent les étapes automatiques. Les estimations dépendent du budget disponible et ne sont pas des prix fixes. Vérifiez le modèle du worker dans les réglages IA du compte avant d’activer le travail sur le code. La même page liste les contrôles d’automatisation des projets dont vous êtes propriétaire ; les membres ne peuvent pas activer le projet d’un autre propriétaire.

![Préréglage d’automatisation sur Aucun.](/documentation/fr/automation-settings-workflow.png)

## Distinguer les mécanismes {#mechanisms}

Smart Fill remplit les valeurs manquantes de priorité, effort, catégories et objectif ; il ne choisit ni l’état, ni le responsable, ni l’échéance. Les préférences du compte distinguent le remplissage à la création et celui des tickets éligibles au triage des projets dont vous êtes propriétaire. L’auto-attribution à la création ou au démarrage est une préférence distincte ; au démarrage, elle ne concerne que les tickets sans responsable.

Smart Assign est un réglage du propriétaire du projet avec des règles par membre. Smart Triage utilise des règles statiques du projet et se distingue du remplissage IA et de l’exécution de code. Vérifiez les destinataires et le déclencheur de chaque règle avant d’enregistrer.

Activez seulement les étapes à exécuter sans autre demande manuelle. Les étapes IA exigent un fournisseur configuré et utilisable et doivent satisfaire les contrôles de budget applicables à l’appel concerné. Des clés personnelles compatibles et validées peuvent exempter leurs appels du quota d’IA incluse du compte et faire facturer les modèles par le fournisseur. Elles ne rendent pas gratuit le calcul de la sandbox : son coût reste comptabilisé séparément, et le plafond par exécution d’une routine constitue une limite distincte. Si du travail inattendu démarre, examinez l’activité du ticket et la conversation, puis désactivez le contrôle du compte ou du projet concerné avant de créer d’autres tickets de test.

![Choix des projets pour les automatisations du compte.](/documentation/fr/automation-settings-projects-workflow.png)
