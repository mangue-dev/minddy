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
  "revision": 5,
  "sourceRevision": 5,
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
      "content/documentation/reviews/account-transfer-execution.json",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json"
    ]
  },
  "review": {
    "revision": 5,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
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
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "transfer-between-instances-export-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/transfer-between-instances-export-workflow.png",
      "alt": "Account export control.",
      "caption": "Account export control. The export excludes keys and tokens; this capture shows the control before a download.",
      "revision": 5,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        816,
        148
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "transfer-between-instances-workflow",
    "transfer-between-instances-export-workflow"
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
