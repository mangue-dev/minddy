---
{
  "id": "change-a-database-schema",
  "locale": "en",
  "title": "Change a database schema safely",
  "summary": "Rename, reorder or convert columns and review any loss of stored values.",
  "topic": "Pages and databases",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P10"
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
      "components/pages/database-property-dialogs.tsx",
      "components/pages/database-column-name.tsx",
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
    "create-a-database",
    "database-cells-and-entries",
    "import-a-database"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "change-a-database-schema-steps",
      "kind": "screenshot",
      "src": "/documentation/en/database-conversion-warning.png",
      "alt": "Conversion warning: changing Text to Number clears one incompatible cell, with Cancel and confirmation buttons.",
      "caption": "Review the real incompatible-cell count before confirming a type change. Cancel preserves the current values.",
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
    "change-a-database-schema-steps"
  ]
}
---

## Change the layout or options {#change-a-database-schema}

Use Columns to show or hide properties with the eye control. Click a header to rename it or drag headers to reorder them; the entry-name column stays first. Select or Multi-select options can be edited from the cell menu or Columns, with names and colors saved together.

Hiding a column changes display preferences rather than deleting its values. Deleting a custom column removes its values from every entry and cannot be undone. Read that consequence before confirming deletion.

## Convert a property type {#convert-column}

Choose Edit column for a custom property and select its new type. The edit dialog converts existing values when saved. If some values are incompatible, its warning states how many cells will be cleared. Continue only if losing those values is acceptable, or cancel to keep the old type and all values.

Changing to Created at uses each entry's original creation date and warns before replacing existing values. Review representative entries after conversion, especially where a number, selection or date might be interpreted differently.

Agent schema edits use the current database revision and a conversion preview token. Concurrent changes invalidate that preview. Re-read and preview again instead of forcing an old conversion; clearing incompatible values requires explicit confirmation.


![Conversion warning: changing Text to Number clears one incompatible cell, with Cancel and confirmation buttons.](/documentation/en/database-conversion-warning.png)
