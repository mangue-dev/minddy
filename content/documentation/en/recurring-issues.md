---
{
  "id": "recurring-issues",
  "locale": "en",
  "title": "Repeat an issue after completion",
  "summary": "Configure recurring work and distinguish it from a scheduled Numo request.",
  "topic": "Projects and issues",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "W09"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "components/settings/project-recurrences-section.tsx",
      "content/knowledge/core-tracker.md",
      "lib/server/recurrence.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "scheduled-routines",
    "project-settings"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "recurring-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/en/issue-date-recurrence.png",
      "alt": "Due-date picker in recurring mode with a weekly Sunday preview and optional time.",
      "caption": "Recurring mode previews the weekly cadence. Confirm the first due date before creating the issue.",
      "revision": 2,
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
    "recurring-issues-steps"
  ]
}
---

## Configure the repeated task {#recurring-issues}

Create or open an issue that remains useful each time, such as a periodic dependency check. Set a due date, then choose a daily, weekly, monthly or yearly recurrence in the issue’s date control. A recurrence without a due date is rejected. Review the properties and assignee before saving. Project recurrence settings list active series; use them to change the cadence or stop repetition.

Recurring issues recreate themselves after the issue is done; the next issue is created in the backlog. Check the next issue's identifier and properties after completing a recurrence.

The next due date comes from the previous due date plus one cadence, not from the day you completed the task. The successor copies title, description, priority, effort, assignee, objective and categories. It does not copy the implementation plan, parent relationship, resources or comments. Recurrence moves to the successor; reopening and completing the old issue again does not create another occurrence. If successor creation fails, the series stops rather than repeatedly retrying on the completed issue. Inspect the result and configure recurrence on the appropriate next task after resolving the failure. Do not assume that a calendar schedule runs code or completes the new issue for you.


![Due-date picker in recurring mode with a weekly Sunday preview and optional time.](/documentation/en/issue-date-recurrence.png)

## Change or stop repetition {#recurrence-change}

Use the recurrence settings to edit or disable future repetition. Inspect already created issues separately: stopping future creation does not mean existing work has been completed or removed.

A Numo routine is a different object: it schedules a conversation and can use the owner's AI budget and configured providers. Choose recurring issues for a repeated tracked task and a routine for an instruction that should execute on a schedule. If the next issue is missing, check whether the previous issue was marked done, whether recurrence remains enabled and whether you are viewing the backlog without restrictive filters.
