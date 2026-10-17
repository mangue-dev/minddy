---
{
  "id": "projects",
  "locale": "en",
  "title": "Projects and members",
  "summary": "Configure a project, invite collaborators, choose their roles and transfer ownership.",
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
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-17",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-685 sidebar context menus; MIN-692 hidden projects; MIN-693 project roles",
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
      "lib/project-key.ts",
      "components/project-context-actions.tsx",
      "components/projects/project-trash-dialog.tsx",
      "content/documentation/reviews/min-685-sidebar-context-actions.md",
      "components/settings/project-visibility-section.tsx",
      "components/settings/account-hidden-projects-section.tsx",
      "lib/use-hidden-projects.ts",
      "lib/server/hidden-projects.ts",
      "content/documentation/reviews/min-692-hidden-projects.md",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "content/documentation/reviews/min-693-project-roles.md"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (MIN-685 sidebar context menu source and unit-test review; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-692 hidden-project source, route and unit-test review; no browser walkthrough; unchanged evidence retained); agent:/root (MIN-693 project roles: decision record, permission matrix and source review; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root (en MIN-685 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root (en MIN-692 added passages, label and retained-meaning self-review; agent review, not human acceptance); agent:/root (en MIN-693 added passages, label and retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-17"
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
      "revision": 9,
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
      "revision": 9,
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

A project brings together issues, objectives, pages and the people who work on them. Its single owner manages administrative settings, invitations and roles. Members work with its content, and readers follow it; both can leave the project. Use the sections below to configure the project, choose who can do what, transfer ownership or resolve an invitation problem.

## Configure a project {#project-settings}

Open the project, then its settings. Project ownership controls administrative settings. Members and readers can inspect the general section, hide the project for themselves and leave it, but do not gain the owner's editing controls.

As owner, enter a nonempty name and a valid project key, then save. The key is normalized to uppercase and uses 2 to 5 ASCII letters. Review the resulting identifiers after changing it. Use the icon and appearance controls to distinguish the project in navigation; these visual choices do not change membership.

Other sections manage collaborators, recurring issues, Git, import, integrations, automation and feedback. Follow the corresponding task guide before enabling a provider or automatic work. Account preferences such as your interface language are separate from project configuration.


![General project settings with name, key, icon and a separate trash action.](/documentation/en/project-general.png)

### Hide a project for yourself {#hide-project}

Hide a project you no longer follow day to day to keep it out of your sidebar and home without leaving it. In the project's general settings, choose **Hide** under **Visibility for you**, or right-click the project in the sidebar and choose **Hide project**. Everyone in the project can hide it, including the owner and readers.

Hiding changes only your own navigation. The preference is saved on your account, so it follows you after signing in again and on your other devices. You keep your access and can still open and edit the project from a direct link or from **Account settings** → **Preferences** → **Hidden projects**. Other members still see the project, and its routines, integrations and notifications keep running. Opening a hidden project does not bring it back to your sidebar.

To bring it back, choose **Show** in **Hidden projects** or in the project's general settings, or choose **Show project** from its sidebar menu. If the change cannot be saved, an error appears and the project returns to its previous state; try again. Unlike leaving or moving to trash, hiding never removes access or content.

### Leaving and deleting {#project-removal}

A member or reader can use the leave action to remove their own access. Ask the owner to invite you again if you later need the project. Leaving is not deleting the project for everyone. The owner cannot leave: [transfer ownership](#transfer-ownership) to a member first.

Project deletion is an owner action in the danger zone. Read the consequences and confirmation before using it, especially when the project contains issues, pages, files or integrations. If a normal save fails, keep your intended values, read the error and refresh the project before retrying; avoid repeatedly submitting a destructive action because its first result is uncertain.

The owner can also right-click the project in the sidebar and choose **Move to trash**. The same confirmation appears, and only the project you clicked is affected.

## Invite people to a project {#project-members}

The project owner manages membership in **Project settings** → **Members**. Ask the collaborator for the email they use on this instance, choose their role, send the invitation and check its pending state. Choose **Member** for someone who works on the project, or **Reader** for someone who only follows it. For a reader, turn on **Can comment** if they should take part in discussions. While the invitation is pending, the owner can change its role and comment option. The same email on another instance does not grant access here.

The invited person signs in with that account and opens Inbox. Accept the pending invitation to join with the role it carries, or decline it if the project is unexpected. The first-use join dialog helps share your email with the owner; it does not let you join projects without an invitation.


![Email invitation form and three demonstration members, with the owner identified.](/documentation/en/project-members.png)

### Owner, member and reader roles {#member-permissions}

| Role | Project access |
| --- | --- |
| Owner | One per project. Everything a member can do, plus project settings, invitations and roles, integrations, the Git link, routines, ownership transfer and project deletion. |
| Member | All content work: issues, plans, objectives, feedback, pages and databases, comments, files, shared views and publication links, Git and pull request actions, Numo and MCP. Can leave the project. |
| Reader | Reads the project's content, members and routines. Can hide the project, appear among a page's viewers, use personal views and notifications, and leave. Cannot edit content, be assigned, lead an objective or publish links, and does not see integrations or share and board tokens. |
| Reader with **Can comment** | Reader access plus comments on issues, objectives, internal feedback threads and pages: replies, mentions, files attached to their own comments, and editing or deleting their own comments. Public replies on the feedback board and pull request comments or reactions stay unavailable. |
| Public-link visitor | Only the content explicitly published through that link; no project membership. |

Readers count toward the plan's guests-per-project limit like members, and so do pending invitations. There is no per-seat billing.

Review the member list before removing someone. The owner row has no removal action; only a [transfer](#transfer-ownership) changes the owner. The owner can cancel a pending invitation before it is accepted; pending state does not disclose whether that address already has an account. Removal stops their membership access; it does not recall exports, screenshots or copies already received. Personal Git, AI and MCP credentials remain account-owned and do not transfer merely because project ownership changes.

### Change a member's role {#change-role}

As owner, open **Project settings** → **Members** and choose the person's new role: **Member** or **Reader**. For a reader, choose whether **Can comment** is on. This option is off by default and is turned off whenever someone becomes a reader, so check it after changing a member to Reader. Your own role as owner changes only through a transfer.

Changing a member to Reader also unassigns their open issues and removes them as lead of their objectives, which takes those issues out of their personal cycle. Reassign that work if it should continue.

A role change applies to the person's next request, in the application, in Numo and through MCP. Content they already loaded or downloaded is not recalled, and a signed file link they already opened can stay valid for a few minutes.

### Missing access {#invitation-recovery}

If an invitation is absent, compare the invited email with the signed-in account and verify the instance URL. Ask the owner to check pending invitations rather than repeatedly creating accounts. If your role changes during an open session, reload the destination and check your role before retrying writes. A reader who needs to edit asks the owner to change their role to Member. Do not share another person's session to work around an access error.

## Transfer ownership {#transfer-ownership}

A project has exactly one owner. To hand it over, open **Project settings** → **Members** as owner, choose **Transfer project ownership** for an existing member and confirm. Only a Member can receive ownership; invite the person or change a reader to Member first. After the transfer, you stay in the project as a Member.

### What moves with ownership {#transfer-effects}

- Your routines in this project are paused and cannot start new work. The new owner creates the routines that should continue under their own budget.
- The plan limits for issues and guests per project, storage, and background AI such as Smart Assign and feedback review now use the new owner's plan and budget. Existing issues and members are kept.
- Subscriptions, payment methods and personal keys and connections stay with each account.
- Pending invitations stay valid.

The transfer fails without changing anything if the new owner's storage cannot hold the project's files, or if they already own a project with the same key. Free storage or change the project key, then try again.
