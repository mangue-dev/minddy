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
    "revision": 6,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions)",
    "date": "2026-10-09"
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
      "alt": "Completed demonstration issue with its description and saved comment.",
      "caption": "The completed state records the application reader check. It does not assert that the example website’s email link was tested.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        508,
        1096
      ],
      "theme": "light",
      "padding": 24
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
2. In the finishing step, review Smart Assign and auto-assignment. Leave automatic assignment off if you intend to assign the demonstration issue yourself. Choose Finish, wait for creation and open the resulting project.
3. Open the project and create an issue. Give it a concrete title, such as “Check the website contact link”. Describe the page, expected destination and how you will verify the result. If the Smart-fill button is shown and enabled, switch it off for this manual example before creating the issue. It controls filling this issue and is independent of the project’s automation and Smart Assign switches.
4. Choose an assignee, priority and effort if they help plan the task. Confirm creation, then open the resulting issue and check its project and identifier.
5. Change its status to in progress when work begins. Perform the check, then record the result in a comment. Use in review if someone still needs to inspect it.
6. Set the status to done after the expected result is verified. Find the issue in the project's completed work or by its identifier to confirm the change.

![Completed demonstration issue with its description and saved comment.](/documentation/en/reader-first-project.png)

## Recover from an unexpected result {#first-use-recovery}

An invitation applies to one account and instance. If it is missing, verify the email you gave the owner and open Inbox on that same instance. You cannot join an arbitrary project by knowing its name. If an issue disappears from the current board after a status change, remove view filters or search its identifier before creating another copy.

On mobile, open the navigation menu to reach the project and use its issue controls. Status and property pickers provide the same task without a desktop keyboard shortcut. Save a project-specific decision as a page and link it to the issue when the task needs durable context.
