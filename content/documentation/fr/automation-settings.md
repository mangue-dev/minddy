---
{
  "id": "automation-settings",
  "locale": "fr",
  "title": "Des automatisations aux routines",
  "summary": "Comprenez ce que sont devenues les automatisations de projet et recréez un workflow sous forme de routine contrôlée par le propriétaire.",
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
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "lib/server/usage.ts"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Recréer une automatisation de projet en routine"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Ce que sont devenues les automatisations de projet {#automation-settings}

Les interrupteurs d’automatisation du projet et les préréglages, tailles d’effort et délais du compte sont remplacés par les [Routines](/docs/scheduled-routines). Les règles d’automatisation configurées dans une version précédente ne s’exécutent plus, et Minddy ne les convertit pas en routines. Les chaînes en attente ou attendant une personne ont été arrêtées sans étape suivante. Les règles archivées restent dans le projet et dans les exports du compte.

Pour conserver un workflow, ouvrez Routines avec le compte du propriétaire du projet et [créez une routine](/docs/scheduled-routines#scheduled-routines) avec les instructions, le déclencheur, les conditions et le délai nécessaires.

## Distinguer les autres aides du projet {#mechanisms}

Smart Fill remplit toujours la priorité, l’effort, les catégories et l’objectif manquants. Smart Assign reste un réglage du propriétaire avec des règles par membre. Smart Triage reste un moteur de règles statiques. L’auto-affectation reste une préférence distincte. Ces aides sont distinctes des routines et ne remplacent pas une automatisation retirée.

Testez manuellement une nouvelle routine, consultez sa conversation privée et son budget, puis activez-la pour écouter les futurs événements. Si un travail inattendu démarre, mettez la routine en pause et consultez l’occurrence avant de réessayer. Le [guide des routines](/docs/scheduled-routines#conditions) explique les attentes et leur invalidation.
