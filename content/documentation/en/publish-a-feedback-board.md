---
{
  "id": "publish-a-feedback-board",
  "locale": "en",
  "title": "Publish a feedback board",
  "summary": "Enable the visitor channel and choose identity, display and review settings as project owner.",
  "topic": "Feedback and requests",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "F01"
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
      "content/knowledge/feedback.md",
      "components/project-feedback-settings.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/posts.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "submit-and-follow-feedback",
    "moderate-feedback",
    "feedback-to-issue",
    "feedback-pages-and-views",
    "feedback-ingestion-and-sso"
  ],
  "aliases": [
    "feedback"
  ],
  "tags": [],
  "figures": [
    {
      "id": "publish-a-feedback-board-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/publish-a-feedback-board-workflow.png",
      "alt": "Enabled public feedback board with local SSO identity configured and its URL concealed.",
      "caption": "The owner enables the board and chooses visitor identity. This demo uses a local SSO signer; the URL and signing secret are concealed.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1150
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "publish-a-feedback-board-workflow"
  ]
}
---

## Configure and open the board {#publish-a-feedback-board}
Open Feedback in project settings as the owner. Complete the setup if no board exists, then enable the public-board channel. Copy its public URL and open it in a signed-out browser to check the visitor view. Members can inspect settings but cannot change publication, rotate tokens or manage the SSO secret.

Choose whether visitors identify by email code or through configured SSO. Configure public comments, category display and any selected public page or view tabs. Review visible data before distributing the URL. Visitors can read without identification; posting, voting and commenting need a board identity. Public representations do not expose visitor email or real name, but the team can handle identified feedback privately.

## Publication and ingestion are separate {#channels}
Turning off the board makes its visitor pages unavailable. Server-to-server ingestion uses a separate feedback integration key and can continue without a public board. A post's public choice, review state and spam status also govern its visibility; “board enabled” alone does not publish every post.

Optional Numo review applies to submitted feedback and depends on project/instance settings, providers and owner usage. With review enabled, submissions wait for review before publication; with it disabled they are not held for a nonexistent review. Check the review queue after a demo submission. Numo sends public replies only when explicitly requested.

![Enabled public feedback board with local SSO identity configured and its URL concealed.](/documentation/en/publish-a-feedback-board-workflow.png)
