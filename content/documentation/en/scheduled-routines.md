---
{
  "id": "scheduled-routines",
  "locale": "en",
  "title": "Scheduled routines",
  "summary": "Set project context, a timezone and an AI cap, then inspect each occurrence.",
  "topic": "Numo and integrations",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "N06"
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
      "content/knowledge/productivity.md",
      "components/routines/create-routine-wizard.tsx",
      "components/routines/routine-detail.tsx",
      "content/documentation/reviews/routine-localized-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Schedule and inspect a Numo routine"
  ],
  "figures": [
    {
      "id": "scheduled-routines-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/scheduled-routines-workflow.png",
      "alt": "Editor of an existing paused demonstration routine, with its prompt localized for display.",
      "caption": "Editor of an existing paused demonstration routine, with its prompt localized for display. Schedule and spending cap are unchanged; nothing was saved or executed.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1447,
        1085
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "scheduled-routines-workflow"
  ]
}
---

## Create the scheduled request {#scheduled-routines}

Only a project owner can create its routine. Open Routines and start a new routine. Choose an owned project, write the instruction and mention the relevant issues, pages or objectives. Select the schedule and timezone; read the first-run preview before creating it. Set the per-run spending cap as a percentage of the monthly budget.

Every occurrence creates a new conversation with the saved instruction and context. It uses the owner's AI budget and personal MCP connections. Numo delegates repository work only when needed, using the account's worker defaults.

## Manage and verify runs {#runs}

Open the routine to edit its instruction or schedule, pause it, or inspect occurrences. A manual run also consumes usage. Open the occurrence conversation to read the outcome, questions, checks and delegated work. A routine waiting for input needs an answer; repeating the schedule cannot supply it.

If a cap stops the run, inspect saved results before adjusting the cap or retrying. After a project ownership change, start a new occurrence as the current owner; old runs cannot use the previous owner's connections.

![Editor of an existing paused demonstration routine, with its prompt localized for display.](/documentation/en/scheduled-routines-workflow.png)
