---
{
  "id": "create-a-database",
  "locale": "en",
  "title": "Create a database and its columns",
  "summary": "Start with an empty list, choose property types and add a first entry.",
  "topic": "Pages and databases",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P08"
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
      "content/knowledge/pages.md",
      "components/pages/database-setup-banner.tsx",
      "components/pages/database-property-dialogs.tsx",
      "lib/page-creation-settlement.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "change-a-database-schema",
    "database-cells-and-entries",
    "import-a-database"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "create-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/en/database-property-types.png",
      "alt": "Database property type picker with text, number, selections, dates, people and checkbox.",
      "caption": "Choose a column type that matches the values to store.",
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
    "create-a-database-steps"
  ]
}
---

## Create the list {#create-a-database}

As a project member, open Pages, use + and choose a database. A new database has its entry name and no optional columns. Its new-database banner offers setup with Numo or importing an existing database. Manual setup remains available without AI. Choosing setup with Numo opens a prepared request with this database as page context, after its creation has settled. Review and send that request to ask for the structure you need; merely opening the conversation does not complete the setup. Actual AI work needs a configured provider and available usage or a compatible personal key. Inspect the resulting schema and entries before relying on them.

Open Columns and choose Add column, or use the + column at the table's right edge. Name the column and choose Text, Number, Select, Multi-select, Created at, Date, People or Checkbox. Use the searchable type picker to find it. Save, add an entry and verify that the column appears in the table and entry page.

## Choose types and respect limits {#database-types}

A database supports up to 30 property columns besides the entry name. Select permits one option; Multi-select permits several, with up to 100 options per column. Text cells support 2,000 characters. Number accepts signed decimals with a dot or comma and rejects letters. Created at is the original entry timestamp and cannot be edited.

People selects project members rather than arbitrary account emails. Newly mentioned members can receive notifications. A database entry is also a full page with normal content, comments and attachments.

Advanced formulas, automations and additional database views are not available. Choose a text property or a linked document when the required data does not fit a supported type; do not describe an unsupported formula as a functioning column.


![Database property type picker with text, number, selections, dates, people and checkbox.](/documentation/en/database-property-types.png)
