---
{
  "id": "git-accounts-and-repositories",
  "locale": "en",
  "title": "Connect Git and link a project repository",
  "summary": "Authorize your provider account, then let the owner select the project's repository.",
  "topic": "Numo and integrations",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "N10"
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
      "content/knowledge/integrations.md",
      "components/settings/account-git-connections-section.tsx",
      "components/settings/project-git-section.tsx",
      "docs/managed-forge-relay-plan.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "forge-issue-sync",
    "feedback-ingestion-and-sso"
  ],
  "aliases": [
    "integrations"
  ],
  "tags": [],
  "figures": [
    {
      "id": "git-accounts-and-repositories-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/git-accounts-and-repositories-workflow.png",
      "alt": "Disconnected GitHub and GitLab accounts with authorization controls.",
      "caption": "Authorize your Git account first. The project owner links a repository separately.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "git-accounts-and-repositories-project-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/git-accounts-and-repositories-project-workflow.png",
      "alt": "Git settings of a project with no linked repository.",
      "caption": "Git settings of a project with no linked repository. Authorize GitHub or GitLab before selecting a repository.",
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
    "git-accounts-and-repositories-workflow",
    "git-accounts-and-repositories-project-workflow"
  ]
}
---

## Account connection and project link {#git-accounts-and-repositories}
In account Git settings, connect GitHub or GitLab and complete the browser authorization. Grant access only to the repositories needed. In desktop, follow the browser return to the app. The account connection can be reused across projects; it does not automatically link every repository.

The project owner opens project settings' Git section, chooses an available repository and confirms the link. Check its provider, full repository name and displayed acting account. Members cannot replace the owner-only link. Linking enables repository context and server-side code work; issue synchronization is a separate switch.

![Disconnected GitHub and GitLab accounts with authorization controls.](/documentation/en/git-accounts-and-repositories-workflow.png)


## Missing repositories or expired access {#recovery}
If the picker is empty, check provider permissions and that the intended organization or repository is authorized. Reconnect an expired account rather than entering tokens in issue text. Unlinking requires owner permission; inspect the confirmation before proceeding.

Self-hosted installations can use a configured managed relay or operator-owned provider apps. A relay connection is started explicitly; it does not make the forge local. Availability depends on instance configuration. Check the operator's provider and relay policy before authorizing access.

![Git settings of a project with no linked repository.](/documentation/en/git-accounts-and-repositories-project-workflow.png)
