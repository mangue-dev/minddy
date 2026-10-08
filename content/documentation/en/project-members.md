---
{
  "id": "project-members",
  "locale": "en",
  "title": "Invite people to a project",
  "summary": "Use the intended account email, accept invitations and manage project access.",
  "topic": "Get started",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "S06"
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
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "content/knowledge/settings-and-data.md",
      "components/project-members.tsx",
      "lib/server/update-project.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "project-settings",
    "notifications-and-inbox",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/en/project-members.png",
      "alt": "Email invitation form and three demonstration members, with the owner identified.",
      "caption": "Invite by account email and check who owns the project before removing another member’s access.",
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
    "project-members-steps"
  ]
}
---

## Send and accept an invitation {#project-members}

The project owner manages membership in the project's member settings. Ask the collaborator for the email they use on this instance, send the invitation and check its pending state. The same email on another instance does not grant access here.

The invited person signs in with that account and opens Inbox. Accept the pending invitation to join or decline it if the project is unexpected. The first-use join dialog helps share your email with the owner; it does not let you join projects without an invitation.


![Email invitation form and three demonstration members, with the owner identified.](/documentation/en/project-members.png)

## Owner and member responsibilities {#member-permissions}

| Actor | Typical project access |
| --- | --- |
| Member | Work with the project's issues, pages and collaboration surfaces; manage their own account preferences. |
| Owner | Member workflows plus project settings, invitations and owner-only integration or automation configuration. |
| Public-link visitor | Only the content explicitly published through that link; no project membership. |

Review the member list before removing someone. The owner row has no removal action, and these member controls do not transfer project ownership. The owner can cancel a pending invitation before it is accepted; pending state does not disclose whether that address already has an account. Removal stops their membership access; it does not recall exports, screenshots or copies already received. Personal Git, AI and MCP credentials remain account-owned and do not transfer merely because project ownership changes.

## Missing access {#invitation-recovery}

If an invitation is absent, compare the invited email with the signed-in account and verify the instance URL. Ask the owner to check pending invitations rather than repeatedly creating accounts. If project permissions change during an open session, reload the destination and check membership before retrying writes. Do not share another person's session to work around an access error.
