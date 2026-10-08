---
{
  "id": "import-issues",
  "locale": "en",
  "title": "Import a CSV backlog after checking its mapping",
  "summary": "Review columns, people, statuses and parent references before creating issues.",
  "topic": "Account and apps",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "A06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/settings/csv-import-panel.tsx",
      "components/settings/import-mapping-editor.tsx",
      "lib/use-csv-import.ts",
      "lib/import/types.ts",
      "lib/server/import-issues.ts",
      "content/documentation/reviews/csv-preview-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "import-issues-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/import-issues-preview-workflow.png",
      "alt": "CSV preview with two localized demonstration rows and detected column mappings.",
      "caption": "CSV preview with two localized demonstration rows and detected column mappings. No import was submitted; optional AI planning was blocked for the capture.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "import-issues-workflow"
  ]
}
---

## Prepare and preview {#import-issues}
The project owner opens Import in project settings and selects a CSV export. Linear and Jira layouts are detected; other CSVs use generic mapping. The limit is 5 MiB and 5,000 issues per import. Split a larger export deliberately and keep parent references within the same batch where possible.

Map the title column before importing. Review description, status, priority, effort, due date, categories and assignees. Map people to actual project members and inspect new categories. Parent references match external keys in the batch and support one level. CSV files do not import attached file bytes.

An AI proposal is requested only for mapping gaps. It is editable and a failed or unavailable provider leaves manual mapping usable. A manual correction prevents a late proposal from overwriting your choices.

## Commit and inspect {#result}
Read the issue counts, status distribution and warnings after each mapping change. Correct skipped or invalid rows before committing. Import creates new issues; do not assume reuploading is a deduplicating update. After success, inspect representative issues, assignments, dates and parent links. If the response is lost, inspect the project before retrying the whole file to avoid duplicate work.

![CSV preview with two localized demonstration rows and detected column mappings.](/documentation/en/import-issues-preview-workflow.png)
