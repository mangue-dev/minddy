---
{
  "id": "issue-statuses",
  "locale": "en",
  "title": "Move an issue through its lifecycle",
  "summary": "Use fixed statuses to distinguish intake, planned work, review and terminal results.",
  "topic": "Projects and issues",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W02"
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
      "components/kanban-board.tsx",
      "components/issue-context-menu.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "triage-incoming-work",
    "issue-dependencies",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-statuses-steps",
      "kind": "screenshot",
      "src": "/documentation/en/issue-statuses.png",
      "alt": "Eight issue statuses in the picker, with backlog currently selected.",
      "caption": "The check marks the current status. Choose the status that reflects the work’s actual state.",
      "revision": 1,
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
    "issue-statuses-steps"
  ]
}
---

## Change a status {#issue-statuses}

Open the issue's status picker or use the board's status actions. In a kanban view, moving work between status columns changes the issue itself; changing a filter only changes what you see. Verify the new status in the detail panel after the move.

| Status | Use |
| --- | --- |
| Triage | Incoming work awaiting review. |
| Backlog | Retained work not yet selected to start. |
| Todo | Work selected to do. |
| In progress | Work underway. |
| In review | Implementation awaiting review. |
| Done | Expected result completed. |
| Canceled | Work closed without delivery. |
| Duplicate | Work represented by another issue. |

Statuses are fixed rather than customized per project. Triage and duplicate are available in pickers but deliberately absent from normal kanban columns. A missing column is not evidence that the status or issue does not exist.


![Eight issue statuses in the picker, with backlog currently selected.](/documentation/en/issue-statuses.png)

## Terminal states and verification {#closed-work}

Done, canceled and duplicate are terminal for tracking: they stop blocking dependent issues and leave active counts. Closing as canceled does not mean the task was delivered. When marking a duplicate, identify the retained issue so discussion and progress have a clear destination.

Check filters if an issue disappears after closing it. Reopen the issue by identifier to inspect the result and change its status if you closed it by mistake. For blocked work, also inspect dependency direction: a status change on one issue does not rewrite its description or plan.
