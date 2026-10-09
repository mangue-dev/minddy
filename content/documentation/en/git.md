---
{
  "id": "git",
  "locale": "en",
  "title": "Git repositories and issue sync",
  "summary": "Connect a Git account, link a project repository and configure issue synchronization with its provider.",
  "topic": "Numo and integrations",
  "type": "guide",
  "audiences": [
    "owner",
    "member",
    "integrator"
  ],
  "workflows": [
    "N10",
    "N11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 2,
  "sourceRevision": 2,
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
      "content/knowledge/integrations.md",
      "components/settings/account-git-connections-section.tsx",
      "components/settings/project-git-section.tsx",
      "docs/managed-forge-relay-plan.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "docs/github-issue-sync.md",
      "content/documentation/reviews/forge-controls-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "api-and-webhooks"
  ],
  "aliases": [
    "git-accounts-and-repositories",
    "integrations",
    "forge-issue-sync"
  ],
  "tags": [
    "Connect Git and link a project repository",
    "Synchronize linked forge issues"
  ],
  "figures": [
    {
      "id": "git-accounts-and-repositories-workflow",
      "kind": "diagram",
      "src": "/documentation/en/git-connection-flow.svg",
      "alt": "A personal account connection and a project repository link are separate steps.",
      "caption": "Authorize the account first, then link a repository as the project owner.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-09",
      "viewport": [
        720,
        580
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "Connect an account, then link a repository",
        "items": [
          {
            "title": "Personal Git account",
            "detail": "Authorize GitHub or GitLab for the repositories you need."
          },
          {
            "title": "Project owner",
            "detail": "Choose an available repository in the project’s Git settings."
          },
          {
            "title": "Linked repository",
            "detail": "Aurora → aurora/web. Issue synchronization is a separate choice."
          }
        ]
      }
    },
    {
      "id": "forge-issue-sync-mapping",
      "kind": "diagram",
      "src": "/documentation/en/forge-issue-sync-mapping.svg",
      "alt": "GitHub sync flow through owner setup, incoming-event checks, import and state mirroring.",
      "caption": "GitHub events preserve newer edits and avoid duplicate deliveries. GitLab field mappings need their own verification.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        720
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "sequence",
        "title": "GitHub issue synchronization",
        "items": [
          {
            "title": "Owner setup",
            "detail": "Link repository, grant Issues read/write and enable issue synchronization."
          },
          {
            "title": "Incoming events",
            "detail": "Deduplicate delivery IDs; reject payloads older than newer local edits."
          },
          {
            "title": "Import and mapping",
            "detail": "Imported issues enter triage. Title/body become title/description; labels supply categories and recognized priority/effort."
          },
          {
            "title": "State mirroring",
            "detail": "Open and closed states mirror in both directions. Compare timestamps when changes compete."
          }
        ],
        "note": "Comments retain remote identity; repeated comments do not duplicate. GitLab field mappings may differ."
      }
    },
    {
      "id": "forge-issue-sync-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/forge-issue-sync-workflow.png",
      "alt": "Linked demonstration GitHub repository with issue synchronization disabled.",
      "caption": "The demonstration repository is linked to GitHub. Issue synchronization is still off; inspect scope and existing backlog before enabling it. This capture does not prove a synchronized import.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        278
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "git-accounts-and-repositories-workflow",
    "forge-issue-sync-workflow",
    "forge-issue-sync-mapping"
  ]
}
---

Connecting a personal Git account, linking a project repository and synchronizing forge issues are separate actions. Authorize the account first; the project owner then chooses the repository and can enable synchronization with the required provider permissions.

## Connect Git and link a project repository {#git-accounts-and-repositories}

In account Git settings, connect GitHub or GitLab and complete the browser authorization. Grant access only to the repositories needed. In desktop, follow the browser return to the app. The account connection can be reused across projects; it does not automatically link every repository.

The project owner opens project settings' Git section, chooses an available repository and confirms the link. Check its provider, full repository name and displayed acting account. Members cannot replace the owner-only link. Linking enables repository context and server-side code work; issue synchronization is a separate switch.

![A personal account connection and a project repository link are separate steps.](/documentation/en/git-connection-flow.svg)

### Missing repositories or expired access {#recovery}

If the picker is empty, check provider permissions and that the intended organization or repository is authorized. Reconnect an expired account rather than entering tokens in issue text. Unlinking requires owner permission; inspect the confirmation before proceeding.

Self-hosted installations can use a configured managed relay or operator-owned provider apps. A relay connection is started explicitly; it does not make the forge local. Availability depends on instance configuration. Check the operator's provider and relay policy before authorizing access.


## Synchronize linked forge issues {#forge-issue-sync}

As project owner, open project settings' Git section after linking the repository. Enable issue synchronization only with the required provider write access. Imported forge issues enter triage. Confirm the reported backfill and inspect a known remote issue, its title, description and state before relying on synchronization.

Open and closed states mirror in both directions. For GitHub, title and body map to title and description; labels supply categories and recognized priority or effort; the first linked assignee is used, and milestone due date supplies the due date. Comments retain remote author, identity, URL and timestamps. Blocking relations require both issues in the same imported project. Original attachment URLs remain; uploaded bytes and GitHub project fields have no native equivalent.

### Permissions, conflicts and disablement {#forge-issue-sync-recovery}

GitHub App synchronization needs Issues read/write and Issues, Issue comments and Issue dependencies subscriptions. Existing installations must accept new permissions. These GitHub mappings are not a guarantee for every GitLab field.

Older timestamped GitHub payloads cannot overwrite newer local edits. Repeated delivery IDs and remote comment identities prevent duplicate delivery effects. Compare remote and local timestamps when diagnosing conflicts; inspect provider events and operator logs for missed backfills. Turn off synchronization in the same owner-only setting to stop the configured sync; inspect existing imported work separately.

![GitHub sync flow through owner setup, incoming-event checks, import and state mirroring.](/documentation/en/forge-issue-sync-mapping.svg)

![Linked demonstration GitHub repository with issue synchronization disabled.](/documentation/en/forge-issue-sync-workflow.png)
