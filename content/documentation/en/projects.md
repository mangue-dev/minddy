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
  "revision": 14,
  "sourceRevision": 14,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
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
      "components/settings/project-general-section.tsx",
      "components/inbox-content.tsx",
      "components/home/onboarding-join-dialog.tsx",
      "components/project-members.tsx",
      "lib/server/update-project.ts",
      "lib/project-key.ts",
      "components/project-context-actions.tsx",
      "components/projects/project-trash-dialog.tsx",
      "components/settings/project-visibility-section.tsx",
      "components/settings/account-hidden-projects-section.tsx",
      "lib/use-hidden-projects.ts",
      "lib/server/hidden-projects.ts",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/settings/project-identity-header.tsx",
      "components/settings/inline-edit-field.tsx",
      "components/project-categories.tsx",
      "components/settings/project-settings-page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/members-api.ts",
      "lib/server/collaborators.ts",
      "lib/collaborator-search.ts",
      "components/collaborator-suggestions.tsx",
      "app/api/me/collaborators/route.ts",
      "components/ui/confirm-delete-dialog.tsx"
    ]
  },
  "review": {
    "revision": 14,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 2 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "alt": "Project header with the icon and its edit badge, the name, the key and the Issues, Members, Objectives, Categories and Created figures.",
      "caption": "Select the icon, the name or the key to change it in place; moving the project to trash stays a separate action below.",
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        816,
        359
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "project-members-steps",
      "kind": "screenshot",
      "src": "/documentation/en/project-members.png",
      "alt": "Invite people card above the Members card, which lists three demonstration members with the owner identified.",
      "caption": "Invite by account email and check who owns the project before removing another member’s access.",
      "revision": 14,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        816,
        414
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
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

The **General** tab opens with the project's identity: its icon, its name and key, then five figures: **Issues**, **Members**, **Objectives**, **Categories** and **Created**. As owner, you change the icon, name and key where they are shown; there is no Save button. Select the icon and choose **New orb** (offered only while no image covers the orb), **Upload an image**, **Import from a website…**, which asks for the website address and imports its icon when you choose **Import**, or, when an image is set, **Remove the image**, which asks first because the image is deleted. Select the name or the key to edit it: on a computer it becomes a field, where Enter or leaving the field saves and Escape cancels; on a phone it opens a sheet with **Save**. The name cannot be empty. The key is normalized to uppercase and must have 2 to 5 letters (A–Z); otherwise an error appears and the key is not saved. Review the resulting identifiers after changing it. The icon only distinguishes the project in navigation; it does not change membership. Members and readers see the same header without these controls.

The other tabs are **Categories**, **Members**, **Recurrences**, **Smart Assign**, **Feedback**, **Git**, **Import** and **Integrations**. Follow the corresponding task guide before enabling a provider or automatic work. Account preferences such as your interface language are separate from project configuration.

In **Categories**, the owner and members manage the categories used to label issues. Choose **New category** on the card's title line: a row with a color dot and a name field appears at the top of the list. Press Enter or choose **Add** to create the category; Escape leaves without creating it. Select a category's color dot to choose another color, which applies at once (on a phone the colors open in a sheet), or select its name to rename it in place. The delete button asks for confirmation, then removes the category from every issue.


![Project header with the icon and its edit badge, the name, the key and the Issues, Members, Objectives, Categories and Created figures.](/documentation/en/project-general.png)

### Hide a project for yourself {#hide-project}

Hide a project you no longer follow day to day to keep it out of your sidebar and home without leaving it. In the project's general settings, choose **Hide** in the **Danger zone**, or right-click the project in the sidebar and choose **Hide project**, then confirm. Both ask first, in a dialog that names the project, because it leaves your navigation; showing it again needs no confirmation. Everyone in the project can hide it, including the owner and readers.

Hiding changes only your own navigation. The preference is saved on your account, so it follows you after signing in again and on your other devices. You keep your access and can still open and edit the project from a direct link or from the **Hidden projects** tab of **Account settings**. Other members still see the project, and its routines, integrations and notifications keep running. Opening a hidden project does not bring it back to your sidebar.

To bring it back, choose **Show** in **Hidden projects** or in the project's general settings, or choose **Show project** from its sidebar menu. If the change cannot be saved, an error appears and the project returns to its previous state; try again. Unlike leaving or moving to trash, hiding never removes access or content.

### Leaving and deleting {#project-removal}

A member or reader can choose **Leave** in the danger zone to remove their own access; a dialog that names the project asks them to confirm first. Ask the owner to invite you again if you later need the project. Leaving is not deleting the project for everyone. The owner cannot leave: [transfer ownership](#transfer-ownership) to a member first.

Removing the project is an owner action: in the danger zone, choose **Move to trash** beside **Move project to trash**. The confirmation names the project and says that its issues, objectives and feedback go with it; the project stays restorable from [Trash](/docs/trash-and-recovery) for 30 days, and its key is freed at once. Read the confirmation before using it, especially when the project contains issues, pages, files or integrations. If a normal save fails, keep your intended values, read the error and refresh the project before retrying; avoid repeatedly submitting a destructive action because its first result is uncertain.

The owner can also right-click the project in the sidebar and choose **Move to trash**. The same confirmation appears, and only the project you clicked is affected.

## Invite people to a project {#project-members}

The project owner manages membership in **Project settings** → **Members**. In the **Invite people** card, search by name or enter the email the collaborator uses on this instance. As you type, **From your projects** proposes people who have already joined one of your other projects, as owner, member or reader, with a verified email; someone who was only invited is never proposed, nor are current members and pending invitations. Choose a person to place them in the field with their avatar and name, or press Enter when the name matches only one person. Anyone else is invited by email. Then choose their role and choose **Invite**. A person chosen from your projects is invited by account: Minddy checks again that they joined one of your projects and otherwise refuses with “This person is not part of your projects.” The invitation appears in the **Pending invitations** card until it is accepted; current members are listed in the **Members** card, whose title shows their number. Choose **Member** for someone who works on the project, or **Reader** for someone who only follows it. For a reader, turn on **Can comment** if they should take part in discussions. While the invitation is pending, the owner can change its role and comment option. The same email on another instance does not grant access here.

The invited person signs in with that account and opens Inbox. Accept the pending invitation to join with the role it carries, or decline it if the project is unexpected. The first-use join dialog helps share your email with the owner; it does not let you join projects without an invitation.

You can also invite people while creating the project. In the wizard's **Invite your team** step, search by name or enter an email. Below the field, **From your projects** proposes the same people as the **Invite people** card, even before you type, and narrows as you type. Choose a person, or press Enter when only one matches; typing such a person's address also adds them by name. Add anyone else by email with **Add** or Enter. The plan's guest limit applies as it does here, and the list is kept with the project draft if you resume creation later.

Nothing is sent before you choose **Finish**: the project is created first, then each person receives an invitation with the **Member** role. People chosen from your projects are invited by account: Minddy checks again that they joined one of your projects and uses their verified address. The others are invited by email. These invitations appear in the **Pending invitations** card, where you can change their role, and are accepted in Inbox like any other. If some are refused, for example because of the plan's guest limit or because someone left your shared project in the meantime (“This person is not part of your projects.”), the others still go out and a notification lists each person who was not invited with the reason. Check the **Pending invitations** card before inviting them again. A pending invitation is recorded, which does not prove that its email was delivered.


![Invite people card above the Members card, which lists three demonstration members with the owner identified.](/documentation/en/project-members.png)

### Owner, member and reader roles {#member-permissions}

| Role | Project access |
| --- | --- |
| Owner | One per project. Everything a member can do, plus project settings, invitations and roles, integrations, the Git link, routines, ownership transfer and project deletion. |
| Member | All content work: issues, plans, objectives, feedback, pages and databases, comments, files, shared views and publication links, Git and pull request actions, Numo and MCP. Can leave the project. |
| Reader | Reads the project's content, members and routines. Can hide the project, appear among a page's viewers, use personal views and notifications, and leave. Cannot edit content, be assigned, lead an objective or publish links, and does not see integrations or share and board tokens. |
| Reader with **Can comment** | Reader access plus comments on issues, objectives, internal feedback threads and pages: replies, mentions, files attached to their own comments, and editing or deleting their own comments. Public replies on the feedback board and pull request comments or reactions stay unavailable. |
| Public-link visitor | Only the content explicitly published through that link; no project membership. |

Readers count toward the plan's guests-per-project limit like members, and so do pending invitations. There is no per-seat billing.

Review the member list before removing someone. The owner row has no removal action; only a [transfer](#transfer-ownership) changes the owner. The owner can cancel a pending invitation before it is accepted, after confirming in a dialog that names the invited address; the link in their email then stops working, and they can be invited again later. Pending state does not disclose whether that address already has an account. Removal stops their membership access; it does not recall exports, screenshots or copies already received. Personal Git, AI and MCP credentials remain account-owned and do not transfer merely because project ownership changes.

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
