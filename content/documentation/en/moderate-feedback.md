---
{
  "id": "moderate-feedback",
  "locale": "en",
  "title": "Review feedback privately and reply publicly",
  "summary": "Process incoming requests without exposing internal notes or changing a visitor's words.",
  "topic": "Feedback and requests",
  "type": "guide",
  "audiences": [
    "owner",
    "member"
  ],
  "workflows": [
    "F03"
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
      "lib/server/feedback/posts.ts",
      "lib/server/feedback/comment-guard.ts",
      "app/api/projects/[id]/feedback/[postId]/comments/route.ts",
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
      "id": "moderate-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/moderate-feedback-workflow.png",
      "alt": "Feedback detail showing a public team reply and an internal note.",
      "caption": "The Public badge identifies the reply visible to visitors; the internal note stays with the team. No AI moderation result is shown.",
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
    "moderate-feedback-workflow"
  ]
}
---

## Review an incoming request {#moderate-feedback}
Project members open the project's Feedback surface and select a request from the review queue or list. Read the original submission, public/private choice, review state and any moderation or duplicate suggestion. Canonical title and body can be clarified while submitted originals remain preserved. Assign categories and a suitable public status; spam never appears on the public board. A private request remains separate from a merely pending public one.

Optional translation is shown beside the source for the team; the public board keeps the written feedback. Check any AI classification before relying on it. If a post is linked to an issue, its status is controlled by that issue and cannot be edited independently.

## Notes and public responses {#responses}
Choose internal discussion for team notes. Public replies are visible to visitors; check visibility before sending. Replies inherit their thread's visibility, so an internal composer choice cannot make a reply inside a public thread private. Numo public answers need an explicit request; mentioning Numo in a public comment does not trigger an automatic reply.

Team members can delete public comments for moderation. Editing stays with the author, and visitor words are never rewritten by the team. Internal comments retain author-only rules. After a public reply or moderation action, inspect the signed-out board to confirm the intended visibility.

![Feedback detail showing a public team reply and an internal note.](/documentation/en/moderate-feedback-workflow.png)
