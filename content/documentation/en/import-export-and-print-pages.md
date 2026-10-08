---
{
  "id": "import-export-and-print-pages",
  "locale": "en",
  "title": "Import, export or print a page",
  "summary": "Choose the output format and check content, hierarchy and attachment fidelity.",
  "topic": "Pages and databases",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P07"
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
      "components/pages/page-document-actions.tsx",
      "lib/server/pages-export.ts",
      "components/pages/page-print-view.tsx"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "publish-a-page",
    "import-a-database",
    "page-history"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-export-and-print-pages-steps",
      "kind": "screenshot",
      "src": "/documentation/en/page-export.png",
      "alt": "Document export menu with Markdown (.md) and Print / PDF.",
      "caption": "Choose Markdown to download the document, or Print / PDF to open the printable view.",
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
    "import-export-and-print-pages-steps"
  ]
}
---

## Choose the document operation {#import-export-and-print-pages}

Open the page’s document menu, then Export. Choose Markdown for a page (.md) or a branch (.zip), PDF to open the print view, or the database archive when the page is a database. Review the offered scope before confirming; a page, its branch and a database archive have different contents.

Open the resulting export and verify headings, callouts, links and attachments needed by its reader. The PDF action opens a readable print view rather than the entire application navigation. Use the browser’s print controls to print or save a PDF. There is no general import action in the document menu; supported imports are started from an empty database, as described in the database import guide.


![Document export menu with Markdown (.md) and Print / PDF.](/documentation/en/page-export.png)

## Database archives and limits {#export-fidelity}

A database archive (.zip) includes its branch: Markdown and CSV, exact schema and option colors, values, bodies, timestamps, nested pages and file bytes. Import it into a new empty database to restore that structure. Device-specific filtering, sorting and hidden-column preferences stay on the original device.

An export is not a transfer of passwords, account provider credentials or subscriptions. For moving account work between instances, use the account-data transfer guide. If an imported format cannot preserve a block or external property, inspect the result before relying on it as a replacement. Do not delete the original merely because a download file was created.
