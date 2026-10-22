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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/settings/account-settings-page.tsx"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 2 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (en manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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

Sign in to the source instance and open the **Privacy & data** tab of account settings. Choose **Download my data** and store the JSON file privately: it contains account and project content, including file bytes. Create or sign in to your account on the destination instance, check its address, open the same tab and choose **Import a transfer file**. Select the unmodified export file and wait for the result before closing the page.

Import adds data rather than replacing the destination. IDs are retained when safely reusable; conflicts receive new IDs. The result reports remapped IDs and skipped memberships. Existing-project membership references are restored only when the target project already exists and the reference is authorized. Inspect projects, issues, pages and personal data after the page reloads.

![Data transfer settings with the import-file button.](/documentation/en/transfer-between-instances-workflow.png)

## What to reconnect {#exclusions}

Passwords, API keys, OAuth tokens, repository credentials and billing subscriptions do not transfer. Configure and authorize needed services again on the destination; an exported project is not proof of working provider access. Review file resources and availability rather than treating the JSON as an operational backup of database and Storage bytes. An export made by v0.11.0 or earlier can contain command palette saved views and code-agent conversations; this release no longer has those features and ignores them on import.

Keep the original instance until the transferred work has been checked. If import fails, preserve the error and verify destination state before repeating. Delete or protect transfer files when no longer needed; never attach them to a public error report.

![Account export control.](/documentation/en/transfer-between-instances-export-workflow.png)

The result remains open until you choose Reload account or close the dialog. Both actions reload the account after you have reviewed the counts.
