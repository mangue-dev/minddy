---
{
  "id": "projects",
  "locale": "en",
  "title": "Projects and members",
  "summary": "Configure a project, invite collaborators and manage membership with the appropriate permissions.",
  "topic": "Get started",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "S05",
    "S06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/knowledge/settings-and-data.md",
      "components/settings/project-general-section.tsx",
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "components/project-members.tsx",
      "lib/server/update-project.ts",
      "content/documentation/reviews/premerge-de-es-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md",
      "lib/project-key.ts"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "issues",
    "git",
    "trash-and-recovery",
    "notifications-and-inbox",
    "permissions-and-public-links"
  ],
  "aliases": [
    "project-settings",
    "project-members"
  ],
  "tags": [
    "Configure a project",
    "Invite people to a project"
  ],
  "figures": [
    {
      "id": "project-settings-steps",
      "kind": "screenshot",
      "src": "/documentation/en/project-general.png",
      "alt": "General project settings with name, key, icon and a separate trash action.",
      "caption": "Check the project name and key before saving. Moving the project to trash is a separate action.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        563
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/en/project-members.png",
      "alt": "Email invitation form and three demonstration members, with the owner identified.",
      "caption": "Invite by account email and check who owns the project before removing another member’s access.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1178,
        503
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "project-settings-steps",
    "project-members-steps"
  ]
}
---

A project brings together issues, objectives, pages and its members. Its owner manages administrative settings and invitations; members work with its content and can leave the project. Use the sections below to configure the project or resolve an invitation problem.

## Configure a project {#project-settings}

Open the project, then its settings. Project ownership controls administrative settings. Members can inspect the general section and leave the project but do not gain the owner's editing controls.

As owner, enter a nonempty name and a valid project key, then save. The key is normalized to uppercase and uses 2 to 5 ASCII letters. Review the resulting identifiers after changing it. Use the icon and appearance controls to distinguish the project in navigation; these visual choices do not change membership.

Other sections manage collaborators, recurring issues, Git, import, integrations, automation and feedback. Follow the corresponding task guide before enabling a provider or automatic work. Account preferences such as your interface language are separate from project configuration.


![General project settings with name, key, icon and a separate trash action.](/documentation/en/project-general.png)

### Leaving and deleting {#project-removal}

A member can use the leave action to remove their own access. Ask the owner to invite you again if you later need the project. Leaving is not deleting the project for everyone.

Project deletion is an owner action in the danger zone. Read the consequences and confirmation before using it, especially when the project contains issues, pages, files or integrations. If a normal save fails, keep your intended values, read the error and refresh the project before retrying; avoid repeatedly submitting a destructive action because its first result is uncertain.

## Invite people to a project {#project-members}

The project owner manages membership in the project's member settings. Ask the collaborator for the email they use on this instance, send the invitation and check its pending state. The same email on another instance does not grant access here.

The invited person signs in with that account and opens Inbox. Accept the pending invitation to join or decline it if the project is unexpected. The first-use join dialog helps share your email with the owner; it does not let you join projects without an invitation.


![Email invitation form and three demonstration members, with the owner identified.](/documentation/en/project-members.png)

### Owner and member responsibilities {#member-permissions}

| Actor | Typical project access |
| --- | --- |
| Member | Work with the project's issues, pages and collaboration surfaces; manage their own account preferences. |
| Owner | Member workflows plus project settings, invitations and owner-only integration or automation configuration. |
| Public-link visitor | Only the content explicitly published through that link; no project membership. |

Review the member list before removing someone. The owner row has no removal action, and these member controls do not transfer project ownership. The owner can cancel a pending invitation before it is accepted; pending state does not disclose whether that address already has an account. Removal stops their membership access; it does not recall exports, screenshots or copies already received. Personal Git, AI and MCP credentials remain account-owned and do not transfer merely because project ownership changes.

### Missing access {#invitation-recovery}

If an invitation is absent, compare the invited email with the signed-in account and verify the instance URL. Ask the owner to check pending invitations rather than repeatedly creating accounts. If project permissions change during an open session, reload the destination and check membership before retrying writes. Do not share another person's session to work around an access error.
