---
{
  "id": "bulk-issue-actions",
  "locale": "en",
  "title": "Update several issues together",
  "summary": "Review a selected set before applying one action to all its issues.",
  "topic": "Projects and issues",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W04"
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
      "components/bulk-issue-actions.tsx",
      "components/global-board.tsx",
      "components/issue-card.tsx",
      "components/marquee-selection.tsx",
      "components/command-palette.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "views-and-filters",
    "personal-cycle"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "bulk-issue-actions-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-bulk-actions.png",
      "alt": "Action menu for two selected demonstration issues.",
      "caption": "The menu applies an action to the selected issues. No grouped change was submitted in this capture.",
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
    "bulk-issue-actions-steps"
  ]
}
---

## Select and act {#bulk-issue-actions}

On a board, hold Shift and click each issue card to toggle its selection. With a mouse, you can also drag a selection rectangle from empty board space; Shift, Command or Ctrl makes that gesture additive. The rectangle gesture is not a touch-screen selection mode. Check the selected count and visible identifiers before opening the bulk actions. Selection is a working set for the action, not a saved view and not a permission grant.

Choose Actions in the floating selection bar to open the command palette. Choose status, priority, effort or assignee, set the value and confirm the inline form. The objective action appears only for a selection in one project with available objectives. Other actions, such as adding to or removing from a cycle, linking two issues or sending the selection to Numo, appear when the current board supports them. Inspect the affected issues afterward. On a touch-only device without a supported multi-selection gesture, edit each issue through its detail panel.

![Action menu for two selected demonstration issues.](/documentation/en/work-bulk-actions.png)

## Partial results and destructive actions {#bulk-results}

When working across projects, verify membership in every affected project. Read any partial failure result: successful changes may already be saved even if another issue was rejected. Inspect the result before retrying the entire selection.

Deletion affects every selected item, so confirm the set before proceeding. Clear selection after the operation when you are moving to unrelated work. If filters change as a result of your update, issues can leave the displayed view while remaining in the project. Search identifiers to verify the new state instead of recreating them.
