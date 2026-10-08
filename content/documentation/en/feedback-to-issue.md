---
{
  "id": "feedback-to-issue",
  "locale": "en",
  "title": "Merge feedback and connect it to delivery",
  "summary": "Choose a canonical request, link real work and verify the issue-driven public status.",
  "topic": "Feedback and requests",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "F04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/feedback/feedback-team-page.tsx",
      "app/api/projects/[id]/feedback/[postId]/promote/route.ts",
      "app/api/projects/[id]/feedback/[postId]/link/route.ts",
      "lib/server/feedback/merge.ts",
      "lib/server/feedback/status-sync.ts",
      "lib/server/feedback/notify.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "feedback-to-issue-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/feedback-to-issue-workflow.png",
      "alt": "Feedback linked to a newly created issue with Planned status.",
      "caption": "Promoting this example created a linked issue in Todo. The public feedback status changed automatically to Planned.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "feedback-to-issue-workflow"
  ]
}
---

## Resolve duplicates {#feedback-to-issue}
As a project member, open the feedback request and choose merge into an existing canonical request from the same project. Read both needs first: similar wording is not proof of the same outcome. The current request becomes the duplicate, votes unite by identity and the duplicate redirects to the canonical request. Review the merge activity; the undo action uses that merge event. Reject an incorrect AI merge suggestion rather than accepting it just to clear the queue.

## Create or link work {#work}
Promote a request to a new issue when work is not already tracked. Review the creation fields before confirming; without supplied fields the default promotion creates backlog work. If an issue already exists, use the link action instead. A post already linked cannot be promoted again. Unlinking keeps the last public status and stops the issue relationship.

Linked status follows the issue: triage/backlog/duplicate → open; todo → planned; in_progress/in_review → in_progress; done → shipped; canceled → declined. Moving work back to backlog also reopens the feedback status. Inspect the linked issue and signed-out request after changing a state.

Team notifications on incoming feedback depend on its source and review transition. Do not promise a voter an automatic email for every merge or issue update; check public status and replies in My feedback. A link makes progress visible without exposing the private issue itself.

![Feedback linked to a newly created issue with Planned status.](/documentation/en/feedback-to-issue-workflow.png)
