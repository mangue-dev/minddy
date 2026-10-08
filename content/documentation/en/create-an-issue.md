---
{
  "id": "create-an-issue",
  "locale": "en",
  "title": "Create and edit an issue",
  "summary": "Describe an actionable task, choose its project and update properties without duplicating work.",
  "topic": "Projects and issues",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W01"
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
      "content/knowledge/core-tracker.md",
      "components/create-issue-dialog.tsx",
      "components/issue-fields.tsx",
      "components/issue-compact-fields.tsx",
      "lib/smart-fill.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-statuses",
    "issue-dependencies",
    "sub-issues",
    "implementation-plans"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "create-an-issue-steps",
      "kind": "screenshot",
      "src": "/documentation/en/new-issue.png",
      "alt": "Unsent issue draft with a localized title and description and manually available properties.",
      "caption": "Describe the expected result, then choose the useful properties before creating the issue.",
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
    "create-an-issue-steps"
  ]
}
---

## Create the task {#create-an-issue}

You need membership in the destination project. Open the project and its new-issue control. Enter a title that names the work, then add the context, expected result and constraints in the description. Choose the project deliberately when creating from a personal or cross-project view.

For manual creation, switch Smart-fill off if its button is shown and enabled. This reveals the priority, effort, category and objective controls for you to set. The switch applies to this issue; reopening the creation form restores its account preference. It is independent of the project’s automation and Smart Assign switches.

Set the useful properties before confirming: status, priority, effort, assignee, objective, categories, due date and recurrence. An assignee is a project member; an objective groups issues around a project outcome. You can leave optional properties unset instead of guessing. Priority ranges from none through low, medium and high to urgent; effort uses XS, S, M, L and XL.

Confirm creation and open the new issue. Check its identifier and project. Reopen its property pickers to change values as the task becomes clearer. The description explains the work; an implementation plan is maintained separately in the Plan tab.


![Unsent issue draft with a localized title and description and manually available properties.](/documentation/en/new-issue.png)

## Check saving and visibility {#issue-save}

After a property change, verify the displayed value. Filters may remove an issue from the current view immediately when its assignee, status or category changes. Search its identifier or open the project without those filters before creating a replacement.

If creation or saving fails, retain your text, read the error and check that membership and the destination still exist. A retry after a network failure should first check whether the issue was already created. Attach project pages as live resources when their current content is needed, and use comments for task discussion.
