---
{
  "id": "implementation-plans",
  "locale": "en",
  "title": "Maintain an implementation plan",
  "summary": "Track ordered steps separately from an issue description without losing completed work.",
  "topic": "Projects and issues",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W07"
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
      "content/knowledge/plans-and-agents.md",
      "components/issue-plan.tsx",
      "captures/shots/issue-plan/intent.md",
      "lib/plan.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "issue-discussion-and-resources",
    "delegate-code-work",
    "review-pull-requests"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "implementation-plans-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-implementation-plan.png",
      "alt": "Demonstration plan showing two of six work tasks complete.",
      "caption": "The saved demonstration plan separates completed, active and pending steps. Its progress does not prove the fictional code task was executed.",
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
    "implementation-plans-steps"
  ]
}
---

## Write the plan {#implementation-plans}

Open the issue's Plan tab. Its description should already state the problem and expected result. Add the implementation steps manually, or ask Numo to inspect the linked repository before proposing a code-level plan. An AI-generated path or function is not evidence unless the repository was actually read.

Indent a task line with two spaces for each nesting level; a tab counts as four spaces. Nesting organizes steps in the plan and does not create issue parent/child relationships. Each noncanceled work task still contributes to progress, including nested tasks.

The plan uses Markdown task lines: `- [ ]` for pending, `- [~]` for in progress, `- [x]` for completed and `- [-]` for canceled. Put the task text after the marker, for example `- [ ] Check the contact link on mobile`. Canceled tasks are excluded from the completion count. Tasks under a recognized Questions heading are treated as questions and are also excluded from progress, so keep work steps in a separate section of the same heading level. Save explicit edits with the save control; cancel discards the draft. Checking a rendered task updates that task's state. Use pending, in progress, completed and canceled states to reflect what happened rather than to imply verification that has not run.

![Demonstration plan showing two of six work tasks complete.](/documentation/en/work-implementation-plan.png)

## Preserve progress and concurrent edits {#plan-progress}

Extend or patch the existing plan instead of replacing it with a new unchecked copy. Retain completed steps and explanations of changed scope. Before saving a substantial rewrite, compare it with the latest plan if another member or agent has been working on the issue.

A written plan can be handed to Numo for implementation when repository work and its configured sandbox are available. After completed work exists, the interface also offers implementation verification. Those actions launch work; the presence of a checked checkbox does not itself prove the code passes tests. Read the result, changes and checks before marking the issue done.
