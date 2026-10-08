---
{
  "id": "database-cells-and-entries",
  "locale": "en",
  "title": "Edit database values and entry pages",
  "summary": "Save cells, select rows and expand an entry while preserving pending edits.",
  "topic": "Pages and databases",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P09"
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
      "components/pages/page-database-view.tsx",
      "components/pages/database-cell-editor.tsx",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "change-a-database-schema",
    "create-a-database",
    "page-history"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "database-cells-and-entries-steps",
      "kind": "screenshot",
      "src": "/documentation/en/database-entry.png",
      "alt": "Demonstration entry with a text description, duration 2.5, a checked checkbox and an empty selection.",
      "caption": "Open an entry to read its complete text and edit typed values.",
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
    "database-cells-and-entries-steps"
  ]
}
---

## Edit a value {#database-cells-and-entries}

Click a table cell or the property above an entry's page body. Enter saves, Escape cancels, and Shift+Enter inserts a text line. Leaving the editor saves. An invalid number keeps the editor open until fixed; a failed save reverts the value and reports an error.

Use a Select cell for one option or Multi-select for several. Search existing options or create a new option from the menu. Open Edit options to rename or recolor options, then save together or cancel. Date, People and Checkbox use their matching controls; Created at stays read-only.

## Open, select and insert entries {#entry-actions}

Open an entry to edit its full page in a floating panel. Extend opens it as a full page after pending document saves finish. If saving fails, the panel stays open so you can resolve it. An empty entry stays in the database until deleted.

Use row checkboxes for a selection and Shift-click for a range. The handle opens actions and can reorder entries in manual order. The gutter + inserts below an entry; Option/Alt inserts above. Adjacent insertion switches back to manual order and clears filters so the new entry is visible.

## Display preferences {#database-display}

Search, filter, sort and hide columns in the single list view. These preferences are remembered on your device; manual order is shared with the page tree. Scroll horizontally with a trackpad gesture, Shift plus mouse wheel, touch or the bottom scrollbar. A clipped text preview does not shorten the stored value. Entries with column values can be reordered within their database but cannot be moved outside it.


![Demonstration entry with a text description, duration 2.5, a checked checkbox and an empty selection.](/documentation/en/database-entry.png)
