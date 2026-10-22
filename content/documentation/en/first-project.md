---
{
  "id": "first-project",
  "locale": "en",
  "title": "Getting started",
  "summary": "Create or join a project, record one task and close it when its result is verified.",
  "topic": "Get started",
  "type": "tutorial",
  "audiences": [
    "member"
  ],
  "workflows": [
    "S01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 9,
  "sourceRevision": 9,
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
      "content/knowledge/core-tracker.md",
      "components/sidebar-onboarding.tsx",
      "app/(app)/home/page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/project-key.ts",
      "components/create-issue-dialog.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (en manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "accounts",
    "projects",
    "issues"
  ],
  "aliases": [
    "core-tracker"
  ],
  "tags": [
    "Complete your first issue"
  ],
  "figures": [
    {
      "id": "first-project-steps",
      "kind": "screenshot",
      "src": "/documentation/en/reader-first-project.png",
      "alt": "Issue AUR-3 in progress, with its description, assignee, effort and category.",
      "caption": "The issue shows its identifier, status and properties. Move it to done only after the expected result is verified.",
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "first-project-steps"
  ]
}
---

## From a project to a completed issue {#first-project}

Use an account on the intended instance. In this example, create a demonstration project for a website and an issue to check its contact link. You can use the same sequence in Cloud or on a configured self-hosted instance; AI is not required.

If your team already has a project, give its owner your account email and accept the invitation in Inbox instead of creating a duplicate project.

1. Open Home after signing in and choose New project in navigation. Choose a brand-new project in the wizard, then enter a name and a key of 2 to 5 letters. Keep the default icon and no repository for this manual example. You can leave the initial brief empty.
2. The wizard then offers to invite your team. Choose Skip for this manual example; to work with others, search for people from your other projects by name, or enter their emails, instead. Nothing is sent until you choose Finish.
3. In the finishing step, review Smart Assign and auto-assignment. Leave automatic assignment off if you intend to assign the demonstration issue yourself. Choose Finish, wait for creation and open the resulting project.
4. Open the project and create an issue. Give it a concrete title, such as “Check the website contact link”. Describe the page, expected destination and how you will verify the result. If the Smart-fill button is shown and enabled, switch it off for this manual example before creating the issue. It controls filling this issue and is independent of Smart Assign and of routines.
5. Choose an assignee, priority and effort if they help plan the task. Confirm creation, then open the resulting issue and check its project and identifier.
6. Change its status to in progress when work begins. Perform the check, then record the result in a comment. Use in review if someone still needs to inspect it.
7. Set the status to done after the expected result is verified. Boards hide the **Done** column by default: select **Done** in the board's **Status** filter, or search the issue's identifier, to confirm the change.

![Issue AUR-3 in progress, with its description, assignee, effort and category.](/documentation/en/reader-first-project.png)

## Recover from an unexpected result {#first-use-recovery}

An invitation applies to one account and instance. If it is missing, verify the email you gave the owner and open Inbox on that same instance. You cannot join an arbitrary project by knowing its name. If an issue disappears from the current board after a status change, remove view filters or search its identifier before creating another copy. Done and canceled issues leave the board by default; select **Done** or **Canceled** in the **Status** filter to show them.

If not every invitation added in the wizard could be sent, the project is still created and a notification lists each person who was not invited with the reason. Check the pending invitations in the project's member settings before inviting again.

On mobile, open the navigation menu to reach the project and use its issue controls. Status and property pickers provide the same task without a desktop keyboard shortcut. Save a project-specific decision as a page and link it to the issue when the task needs durable context.
