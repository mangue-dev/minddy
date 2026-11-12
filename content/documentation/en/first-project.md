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
  "revision": 12,
  "sourceRevision": 12,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-12",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "app/(app)/home/page.tsx",
      "components/create-project-wizard.tsx",
      "lib/project-draft.ts",
      "lib/project-key.ts",
      "components/create-issue-dialog.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts",
      "components/first-run/first-run-gate.tsx",
      "components/first-run/onboarding-screen.tsx",
      "lib/use-onboarding.ts",
      "components/wizard/wizard-dialog.tsx",
      "components/import/import-guide.tsx",
      "lib/import-guides.ts",
      "lib/project-seed-handoff.ts"
    ]
  },
  "review": {
    "revision": 12,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 1 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures); agent:claude-code (MIN-907 first-run profile page and phone getting-started tour before Home: checked against components/first-run/first-run-gate.tsx, components/first-run/onboarding-screen.tsx and lib/first-run.ts; no browser walkthrough; existing figure kept); agent:claude-code (MIN-907 tour follow-up: skip confirmation, final screen with confetti, Home after the tour and the issue step completed on creation, checked against components/first-run/onboarding-screen.tsx, lib/use-onboarding.ts and messages/*.json; no browser walkthrough; existing figures do not show the tour and were kept); agent:claude-code (MIN-907 project wizard: the origin question, the brief step and the name suggestion are gone; the wizard opens on the name and key, with I want to join a project between Continue and Back; steps in order name, icon, repository, Invite your team, Bring your issues over, Finishing touches; Back is a full button from the second step; the import step offers a tool list, a folded How to export from section and Choose the CSV file, and the import dialog opens on the new project; checked against components/create-project-wizard.tsx, lib/project-draft.ts PROJECT_WIZARD_STEPS, components/wizard/wizard-dialog.tsx, components/import/import-guide.tsx, lib/project-seed-handoff.ts, app/(app)/projects/[id]/page.tsx and messages/*.json; no browser walkthrough; the existing figure shows an issue, not the wizard, and was kept); agent:claude-code (MIN-964 tour on every platform: the new-account paragraph no longer limits the getting-started steps to a phone, and components/sidebar-onboarding.tsx left the evidence; checked against components/first-run/first-run-gate.tsx and components/first-run/onboarding-screen.tsx; no browser walkthrough; no figure recaptured)",
    "language": "agent:claude-code (en changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-907 new-account paragraph, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-907 tour follow-up skip sentence with catalog UI labels; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-907 wizard steps, join sentence and import paragraph rewritten, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance); agent:claude-code (en MIN-964 changed passages on the tour on every platform, with catalog UI labels, in the locale's register and glossary; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-12"
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
      "revision": 12,
      "reviewed": true,
      "capturedAt": "2026-11-04",
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

If your team already has a project, give its owner your account email and accept the invitation in Inbox instead of creating a duplicate project. On the wizard's first step, **I want to join a project** explains how joining works.

A new account first asks for your name and picture on **What should we call you?**. The getting-started steps follow, one page at a time: create the project from their first step, or choose **Skip onboarding**, confirm, and follow this example from Home. See [Create an account and sign in](/docs/accounts#account-access).

1. Open Home after signing in and choose **New project** in navigation. The wizard opens on **What's your project called?**: enter a name and a key of 2 to 5 letters, then choose **Continue**.
2. Keep the default icon on **Project icon** and choose **Continue**. On **Link a repository**, choose **Skip** for this manual example. From the second step on, **Back**, under **Continue**, returns to the previous step.
3. On **Invite your team**, choose **Skip** for this manual example; to work with others, search for people from your other projects by name, or enter their emails, instead. Nothing is sent until you choose **Finish**.
4. On **Bring your issues over**, choose **Skip**: this example starts with no issues. To start from another tool instead, see the paragraph after these steps.
5. On **Finishing touches**, review Smart Assign. Choose **Finish**, wait for creation and open the resulting project.
6. Open the project and create an issue. Give it a concrete title, such as “Check the website contact link”. Describe the page, expected destination and how you will verify the result. If the Smart Fill button is shown and enabled, switch it off for this manual example before creating the issue. It controls filling this issue and is independent of Smart Assign and of routines.
7. Choose an assignee, priority and effort if they help plan the task. Confirm creation, then open the resulting issue and check its project and identifier.
8. Change its status to in progress when work begins. Perform the check, then record the result in a comment. Use in review if someone still needs to inspect it.
9. Set the status to done after the expected result is verified. Boards hide the **Done** column by default: select **Done** in the board's **Status** filter, or search the issue's identifier, to confirm the change.

To bring issues over from another tool, choose that tool in the list on **Bring your issues over**: Linear, Jira, Notion, GitHub, Trello or minddy. **How to export from …** unfolds the export steps for the chosen tool. Export the CSV there, then choose **Choose the CSV file**. The chosen file appears with a button to remove it. It is imported once the project exists: the project opens with an import dialog holding the file, where you match the columns and confirm the import. A saved draft of the wizard does not keep the file; if you resume creation later, choose it again.

![Issue AUR-3 in progress, with its description, assignee, effort and category.](/documentation/en/reader-first-project.png)

## Recover from an unexpected result {#first-use-recovery}

An invitation applies to one account and instance. If it is missing, verify the email you gave the owner and open Inbox on that same instance. You cannot join an arbitrary project by knowing its name. If an issue disappears from the current board after a status change, remove view filters or search its identifier before creating another copy. Done and canceled issues leave the board by default; select **Done** or **Canceled** in the **Status** filter to show them.

If not every invitation added in the wizard could be sent, the project is still created and a notification lists each person who was not invited with the reason. Check the pending invitations in the project's member settings before inviting again.

On mobile, open the navigation menu to reach the project and use its issue controls. Status and property pickers provide the same task without a desktop keyboard shortcut. Save a project-specific decision as a page and link it to the issue when the task needs durable context.
