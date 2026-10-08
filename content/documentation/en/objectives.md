---
{
  "id": "objectives",
  "locale": "en",
  "title": "Track an outcome with an objective",
  "summary": "Create a project outcome, attach issues and inspect its progress.",
  "topic": "Projects and issues",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W10"
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
      "content/knowledge/core-tracker.md",
      "components/objective-dialog.tsx",
      "components/objective-detail.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "objective-dependencies-and-momentum",
    "create-an-issue",
    "personal-cycle"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "objectives-steps",
      "kind": "screenshot",
      "src": "/documentation/en/reader-objectives.png",
      "alt": "Unsubmitted objective-creation dialog with a demonstration result name.",
      "caption": "Name the result before choosing the lead, target date and status. This dialog has not created a second objective.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "objectives-steps"
  ]
}
---

## Create and populate an objective {#objectives}

Open the project's Objectives destination and create an objective. Name the result you want, add useful context, and set its available lead, target date, color and status fields. The lead is the person responsible for the outcome; choosing a lead does not transfer project ownership. An objective belongs to a project; it is distinct from a personal cycle spanning several projects.

Open each relevant issue and choose the objective in its properties, or use the objective's issue controls. Check that the intended work appears under the objective. Use its discussion and resources for decisions and reference pages that apply to the whole outcome.

![Unsubmitted objective-creation dialog with a demonstration result name.](/documentation/en/reader-objectives.png)

## Read progress before closing {#objective-progress}

Review completed and active issues alongside the objective's progress. A progress indicator summarizes attached work; it cannot determine whether a product outcome is acceptable. Inspect missing tasks and canceled or duplicate work before marking the objective complete.

Use the objective lifecycle to distinguish planned, underway, completed and canceled outcomes. A target date is a goal, while a forecast is an estimate based on activity. If the objective appears empty, check issue membership and view filters instead of recreating it. Deleting an objective uses the recoverable trash workflow rather than being an ordinary status change.
