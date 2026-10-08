---
{
  "id": "forge-issue-sync",
  "locale": "en",
  "title": "Synchronize linked forge issues",
  "summary": "Enable import and state synchronization, then diagnose permissions and competing edits.",
  "topic": "Numo and integrations",
  "type": "guide",
  "audiences": [
    "owner",
    "integrator"
  ],
  "workflows": [
    "N11"
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
      "docs/github-issue-sync.md",
      "content/knowledge/integrations.md",
      "components/settings/project-git-section.tsx",
      "content/documentation/reviews/forge-controls-capture-candidates.json"
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
      "id": "forge-issue-sync-mapping",
      "kind": "diagram",
      "src": "/documentation/en/forge-issue-sync-mapping.png",
      "alt": "GitHub sync flow through owner setup, incoming-event checks, import and state mirroring.",
      "caption": "GitHub events preserve newer edits and avoid duplicate deliveries. GitLab field mappings need their own verification.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        720
      ],
      "theme": "neutral"
    },
    {
      "id": "forge-issue-sync-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/forge-issue-sync-workflow.png",
      "alt": "Linked demonstration GitHub repository with issue synchronization disabled.",
      "caption": "The demonstration repository is linked to GitHub. Issue synchronization is still off; inspect scope and existing backlog before enabling it. This capture does not prove a synchronized import.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1400,
        1000
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "forge-issue-sync-workflow",
    "forge-issue-sync-mapping"
  ]
}
---

## Enable and verify {#forge-issue-sync}
As project owner, open project settings' Git section after linking the repository. Enable issue synchronization only with the required provider write access. Imported forge issues enter triage. Confirm the reported backfill and inspect a known remote issue, its title, description and state before relying on synchronization.

Open and closed states mirror in both directions. For GitHub, title and body map to title and description; labels supply categories and recognized priority or effort; the first linked assignee is used, and milestone due date supplies the due date. Comments retain remote author, identity, URL and timestamps. Blocking relations require both issues in the same imported project. Original attachment URLs remain; uploaded bytes and GitHub project fields have no native equivalent.

## Permissions, conflicts and disablement {#recovery}
GitHub App synchronization needs Issues read/write and Issues, Issue comments and Issue dependencies subscriptions. Existing installations must accept new permissions. These GitHub mappings are not a guarantee for every GitLab field.

Older timestamped GitHub payloads cannot overwrite newer local edits. Repeated delivery IDs and remote comment identities prevent duplicate delivery effects. Compare remote and local timestamps when diagnosing conflicts; inspect provider events and operator logs for missed backfills. Turn off synchronization in the same owner-only setting to stop the configured sync; inspect existing imported work separately.

![GitHub sync flow through owner setup, incoming-event checks, import and state mirroring.](/documentation/en/forge-issue-sync-mapping.png)

![Linked demonstration GitHub repository with issue synchronization disabled.](/documentation/en/forge-issue-sync-workflow.png)
