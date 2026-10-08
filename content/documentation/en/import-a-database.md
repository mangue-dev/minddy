---
{
  "id": "import-a-database",
  "locale": "en",
  "title": "Import a database with its entry content",
  "summary": "Review schema mapping and page counts before loading an empty database.",
  "topic": "Pages and databases",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P11"
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
      "components/pages/database-import-dialog.tsx",
      "lib/server/database-import.ts",
      "content/knowledge/pages.md"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-a-database",
    "change-a-database-schema",
    "import-export-and-print-pages"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-a-database-steps",
      "kind": "screenshot",
      "src": "/documentation/en/database-import-review.png",
      "alt": "Import review for a local CSV: two entry pages and two property columns, with the Import database button.",
      "caption": "Review the parsed entries and column count before importing into the empty database.",
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
    "import-a-database-steps"
  ]
}
---

## Choose the import {#import-a-database}

Create a database with no optional columns or existing entries. From its new-database banner, choose import an existing database. Upload a Notion Markdown & CSV ZIP with subpages, a database CSV or a Minddy database archive. If the archive contains several databases, select the one to import.

Review suggested column names and types, then the page count, before confirming. Numo can suggest types from a small sample when import assistance is configured; manual mapping remains available. Unsupported source properties stay as text. Incompatible values block import rather than being silently cleared.

## What is preserved and what needs checking {#database-import-result}

Import includes entry bodies, nested documents and local files present in the archive. A Minddy archive also preserves exact schema and option colors, and remaps internal page/file links. People can be matched to destination project members. A Notion export does not contain its original schema, option colors or formula definitions, so those cannot be recovered from absent information.

Archives are limited to 20 MB compressed, 50 MB expanded and 1,000 pages. Each attachment retains the 10 MB page-file limit. The database write is transactional. A retry of the same attempt in the open dialog keeps its request identifier, so a completed attempt is returned without duplicating rows. Loading another file or reopening a fresh dialog can create a new attempt. After an uncertain network result, inspect the destination before restarting; an already populated database no longer satisfies the empty-target prerequisite.

After success, inspect sample entries, values, nested pages and attachments. Keep the original archive until that check passes. If import fails, read the first error and correct the format or mapping before retrying; do not fill the destination manually and then assume it still meets the empty-database requirement.


![Import review for a local CSV: two entry pages and two property columns, with the Import database button.](/documentation/en/database-import-review.png)
