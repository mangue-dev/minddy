---
{
  "id": "triage-incoming-work",
  "locale": "en",
  "title": "Review incoming work in triage",
  "summary": "Clarify new requests before adding them to planned work.",
  "topic": "Projects and issues",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "W03"
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
      "app/(app)/projects/[id]/triage/page.tsx",
      "components/triage/triage-page.tsx",
      "lib/smart-triage.ts",
      "lib/view-filter.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-statuses",
    "create-an-issue",
    "feedback-to-issue"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "triage-incoming-work-steps",
      "kind": "screenshot",
      "src": "/documentation/en/triage-incoming.png",
      "alt": "Incoming demonstration issue DOC-11 with its report, properties and duplicate, Decline and Accept controls.",
      "caption": "Read the incoming report before accepting it, declining it or linking a duplicate.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "triage-incoming-work-steps"
  ]
}
---

## Review the intake {#triage-incoming-work}

Open the project's Triage destination. Read the incoming issue and its source context before accepting it into planned work. Check whether an existing issue already represents the request. Clarify the expected outcome, project, assignee, priority and effort as needed.

Choose Accept and confirm to move a retained issue to backlog. Choose Decline and confirm to set it to canceled. For a duplicate, use the duplicate picker to select the retained issue; the incoming issue becomes duplicate and points to that issue. After an item leaves triage, the next item is selected. Verify the resulting status or duplicate link in the issue itself. Moving between cards without taking one of these actions does not close the issue.

## Sorting and limits {#triage-order}

Smart Triage uses deterministic sorting rules.

Within each status column, the rules first put open issues blocking other open work ahead of unblocked issues. Issues blocked by open work go last, even when they also block other issues. Closed endpoints no longer create that priority. Within a tier, higher priority, smaller effort and overdue or imminent due dates bring work forward. Within the same blocking tier, issues sharing an objective stay together, ordered by the best-ranked issue in their group. Ties use due date, then oldest creation date, then manual position, with the identifier as a final stable tie-break. A related link does not affect this ordering. It is not an experimental AI triage mode. The ordering helps decide which items to inspect first; it does not establish the truth of a description, resolve duplicates automatically or grant permissions.

If the expected item is missing, check the active project, status and filters, then search its identifier. Imported or externally synchronized work may enter triage; inspect the original source and the integration's mapping before changing mirrored fields. A request linked from feedback is still a distinct feedback object with its own public discussion.


![Incoming demonstration issue DOC-11 with its report, properties and duplicate, Decline and Accept controls.](/documentation/en/triage-incoming.png)
