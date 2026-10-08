---
{
  "id": "sub-issues",
  "locale": "en",
  "title": "Split an issue into sub-issues",
  "summary": "Track smaller tasks under a parent and unlink a child without deleting it.",
  "topic": "Projects and issues",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W06"
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
      "components/issue-parent-menu.tsx",
      "components/issue-family-banner.tsx",
      "lib/server/create-issue.ts",
      "lib/server/update-issue.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "create-an-issue",
    "issue-dependencies",
    "implementation-plans"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "sub-issues-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-sub-issues.png",
      "alt": "Sub-issue creation field in a demonstration parent issue.",
      "caption": "The inline field creates a child under this parent; a child keeps its own status and discussion.",
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
    "sub-issues-steps"
  ]
}
---

## Build the hierarchy {#sub-issues}

Open the parent issue and use its sub-issue controls to create smaller pieces of work. Give each child a distinct outcome. Inspect its project, properties and parent identifier after creation; a hierarchy should make the task easier to track, not replace the description of what each child must achieve.

The hierarchy permits one level: a parent must be a top-level issue in the same project, and a sub-issue cannot itself have children. When no objective is explicitly chosen during creation, the child inherits the parent’s objective; inspect the resulting properties rather than assuming that later parent edits propagate.

A child remains an issue with its own status and discussion. The parent’s progress indicator is weighted by child effort and status completion credit. The sub-issue list’s completed/total counter is a separate raw count. Read the child states alongside both measures. Use a dependency when you mean “must finish before”; use a parent when you mean “part of this larger task”.

![Sub-issue creation field in a demonstration parent issue.](/documentation/en/work-sub-issues.png)

## Open or remove the parent relationship {#change-parent}

The parent identifier beside the child title opens a menu. Use the open-parent action to inspect the larger task. To detach the child, choose unlink from the parent and read the confirmation before applying it. Successful unlinking removes the parent relationship while retaining the issue.

Do not delete a child merely to reorganize the hierarchy. Check existing parent and child relationships before reparenting, and resolve a rejected relationship rather than forcing a circular hierarchy. If a save fails, reopen the child to see whether the parent change was applied before retrying. Keep completed child work intact when revising the overall plan.
