---
{
  "id": "submit-and-follow-feedback",
  "locale": "en",
  "title": "Submit, vote and follow feedback",
  "summary": "Identify yourself on a board, choose visibility and find your requests and votes.",
  "topic": "Feedback and requests",
  "type": "guide",
  "audiences": [
    "visitor"
  ],
  "workflows": [
    "F02"
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
      "app/f/[token]/feedback-auth.tsx",
      "app/f/[token]/actions.ts",
      "app/f/[token]/me/page.tsx",
      "lib/server/feedback/otp.ts",
      "lib/feedback/types.ts",
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
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/submit-and-follow-feedback-workflow.png",
      "alt": "Visitor feedback form with a title, description and public visibility enabled.",
      "caption": "A signed-in visitor submits a need and chooses whether it appears publicly. The example was actually submitted with automatic review disabled.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1365,
        1000
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "submit-and-follow-feedback-workflow"
  ]
}
---

## Identify and submit {#submit-and-follow-feedback}
Open the board's public URL. You can read public posts without a Minddy account. To submit, vote or comment, identify through the board's email-code flow or the product's SSO link. Email-code delivery depends on the instance's email service. A code lasts ten minutes and allows five attempts; wait at least sixty seconds before requesting another. Never share the code.

Search existing requests before posting. Write a specific title and describe the need and its context. Titles allow 200 characters and bodies 10,000. The public option is selected by default; clear it to send the request privately to the team. Review the text for secrets before submitting. Optional moderation can keep the request pending before it appears publicly.

## Vote, comment and follow {#follow}
Vote on an existing request instead of duplicating it. Your identity has one vote per post. Comments require identification and enabled public comments; the public comment limit is 5,000 characters. You can remove your own comment; the team can moderate public comments.

Open My feedback to find your submitted requests and votes, including what your current identity can see. Read the public status and team replies there or on the request. Team-only notes are not public replies. If SSO expired, return through a fresh product link; changing browser or identity can change the personal list.

![Visitor feedback form with a title, description and public visibility enabled.](/documentation/en/submit-and-follow-feedback-workflow.png)
