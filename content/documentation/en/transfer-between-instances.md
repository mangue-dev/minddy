---
{
  "id": "transfer-between-instances",
  "locale": "en",
  "title": "Account data transfers",
  "summary": "Export a private JSON file, import additively and inspect conflicts and exclusions.",
  "topic": "Account and apps",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/knowledge/settings-and-data.md",
      "components/settings/account-data-section.tsx",
      "lib/server/account-import.ts",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "content/documentation/reviews/account-transfer-execution.json"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Transfer account data to another instance"
  ],
  "figures": [
    {
      "id": "transfer-between-instances-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/transfer-between-instances-workflow.png",
      "alt": "Data transfer settings with the import-file button.",
      "caption": "Choose the intact JSON export from the source account; review the import result before closing.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "transfer-between-instances-export-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/transfer-between-instances-export-workflow.png",
      "alt": "Account export control.",
      "caption": "Account export control. The export excludes keys and tokens; this capture shows the control before a download.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "transfer-between-instances-result-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/transfer-between-instances-result.png",
      "alt": "Import result showing zero remapped IDs and zero skipped memberships.",
      "caption": "This real personal-data import reports no ID conflicts and no skipped memberships. Review the counts, then use Reload account or close the dialog to reload.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        860
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "transfer-between-instances-workflow",
    "transfer-between-instances-export-workflow",
    "transfer-between-instances-result-workflow"
  ]
}
---

## Export and import {#transfer-between-instances}

Sign in to the source instance and open account settings' Data section. Download the JSON export and store it privately: it contains account and project content. Create or sign in to your account on the destination instance, check its address, and choose the import control there. Select the unmodified export file and wait for the result before closing the page.

Import adds data rather than replacing the destination. IDs are retained when safely reusable; conflicts receive new IDs. The result reports remapped IDs and skipped memberships. Existing-project membership references are restored only when the target project already exists and the reference is authorized. Inspect projects, issues, pages and personal data after the page reloads.

![Data transfer settings with the import-file button.](/documentation/en/transfer-between-instances-workflow.png)

## What to reconnect {#exclusions}

Passwords, API keys, OAuth tokens, repository credentials and billing subscriptions do not transfer. Configure and authorize needed services again on the destination; an exported project is not proof of working provider access. Review file resources and availability rather than treating the JSON as an operational backup of database and Storage bytes.

Keep the original instance until the transferred work has been checked. If import fails, preserve the error and verify destination state before repeating. Delete or protect transfer files when no longer needed; never attach them to a public error report.

![Account export control.](/documentation/en/transfer-between-instances-export-workflow.png)

The result remains open until you choose Reload account or close the dialog. Both actions reload the account after you have reviewed the counts.

![Import result showing zero remapped IDs and zero skipped memberships.](/documentation/en/transfer-between-instances-result.png)
