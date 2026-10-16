---
{
  "id": "automation-settings",
  "locale": "fr",
  "title": "Des automatisations aux routines",
  "summary": "Vérifiez les propositions de migration en pause avant d’activer le travail Numo par événement.",
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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-16",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677); MIN-721 removal of Numo code work",
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
      "components/settings/smart-assign-section.tsx",
      "content/knowledge/settings-and-data.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/usage.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/min-677-routines.md",
      "content/documentation/reviews/min-721-code-work-removal-2026-10-16.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root (MIN-677 source review and isolated PostgreSQL regressions; unchanged procedures retain prior evidence); agent:/root/min721_docs (MIN-721 source review inherited from en revision 7; no operational rerun)",
    "language": "agent:/root (fr translation, label and retained-meaning self-review); agent:/root/min721_docs (fr translation of the MIN-721 removal edit; agent review, not human acceptance)",
    "date": "2026-10-16"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Configurer le travail automatique des tickets"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Vérifier le travail migré {#automation-settings}

Les interrupteurs d’automatisation du projet et les préréglages, tailles d’effort et délais du compte sont remplacés par les [Routines](/docs/scheduled-routines). Ouvrez Routines avec le compte du propriétaire du projet. Les règles actives de l’archive sont proposées une seule fois comme routines en pause ; ouvrir la liste ne les active pas et ne consomme pas de budget d’exécution.

Vérifiez les instructions, le statut déclencheur, les conditions, le délai et le plafond de chaque proposition. Le workflow original reste dans les instructions pour comparaison. Vérifiez ses validations humaines et références indisponibles avant l’activation. Les propositions demandent l’avis du propriétaire aux validations humaines et limitent par défaut chaque occurrence à 15 % du budget mensuel. Elles ne poursuivent pas silencieusement l’ancienne chaîne. Les chaînes en attente ou attendant une personne s’arrêtent, sans étape suivante de chaîne. L’activité historique et les sauvegardes du compte conservent l’archive.

## Distinguer les autres aides du projet {#mechanisms}

Smart Fill remplit toujours la priorité, l’effort, les catégories et l’objectif manquants. Smart Assign reste un réglage du propriétaire avec des règles par membre. Smart Triage reste un moteur de règles statiques. L’auto-affectation reste une préférence distincte. Ces aides n’activent pas une proposition migrée.

Testez manuellement une routine vérifiée, consultez sa conversation privée et son budget, puis activez-la pour écouter les futurs événements. Si un travail inattendu démarre, mettez la routine en pause et consultez l’occurrence avant de réessayer. Le [guide des routines](/docs/scheduled-routines#conditions) explique les attentes et leur invalidation.
