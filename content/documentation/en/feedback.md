---
{
  "id": "feedback",
  "locale": "en",
  "title": "Feedback",
  "summary": "Publish a feedback board, follow requests, moderate submissions and connect accepted feedback to project work.",
  "topic": "Feedback and requests",
  "type": "guide",
  "audiences": [
    "owner",
    "visitor",
    "member"
  ],
  "workflows": [
    "F01",
    "F02",
    "F03",
    "F04",
    "F05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/documentation/reviews/feedback-local-capture-candidates.json",
      "app/f/[token]/feedback-auth.tsx",
      "app/f/[token]/actions.ts",
      "app/f/[token]/me/page.tsx",
      "lib/server/feedback/otp.ts",
      "lib/feedback/types.ts",
      "components/feedback/feedback-team-page.tsx",
      "lib/server/feedback/comment-guard.ts",
      "app/api/projects/[id]/feedback/[postId]/comments/route.ts",
      "app/api/projects/[id]/feedback/[postId]/promote/route.ts",
      "app/api/projects/[id]/feedback/[postId]/link/route.ts",
      "lib/server/feedback/merge.ts",
      "lib/server/feedback/status-sync.ts",
      "lib/server/feedback/notify.ts",
      "components/feedback/feedback-settings-shared.tsx",
      "lib/server/feedback/public-nav.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "api-and-webhooks"
  ],
  "aliases": [
    "publish-a-feedback-board",
    "submit-and-follow-feedback",
    "moderate-feedback",
    "feedback-to-issue",
    "feedback-pages-and-views"
  ],
  "tags": [
    "Publish a feedback board",
    "Submit, vote and follow feedback",
    "Review feedback privately and reply publicly",
    "Merge feedback and connect it to delivery",
    "Add public pages and views to a feedback board"
  ],
  "figures": [
    {
      "id": "publish-a-feedback-board-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/publish-a-feedback-board-workflow.png",
      "alt": "Enabled public feedback board with local SSO identity configured and its URL concealed.",
      "caption": "The owner enables the board and chooses visitor identity. This demo uses a local SSO signer; the URL and signing secret are concealed.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1150
      ],
      "theme": "light"
    },
    {
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/submit-and-follow-feedback-workflow.png",
      "alt": "Visitor feedback form with a title, description and public visibility enabled.",
      "caption": "A signed-in visitor submits a need and chooses whether it appears publicly. The example was actually submitted with automatic review disabled.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1365,
        1000
      ],
      "theme": "light"
    },
    {
      "id": "moderate-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/moderate-feedback-workflow.png",
      "alt": "Feedback detail showing a public team reply and an internal note.",
      "caption": "The Public badge identifies the reply visible to visitors; the internal note stays with the team. No AI moderation result is shown.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "feedback-to-issue-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/feedback-to-issue-workflow.png",
      "alt": "Feedback linked to a newly created issue with Planned status.",
      "caption": "Promoting this example created a linked issue in Todo. The public feedback status changed automatically to Planned.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/feedback-pages-and-views-workflow.png",
      "alt": "Published feedback guide selected in the board navigation and readable without sign-in.",
      "caption": "Publish a page, enable page tabs and select it for the board. This demonstration page was opened anonymously; the opaque URL keeps noindex.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        650
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "publish-a-feedback-board-workflow",
    "submit-and-follow-feedback-workflow",
    "moderate-feedback-workflow",
    "feedback-to-issue-workflow",
    "feedback-pages-and-views-workflow"
  ]
}
---

Feedback connects visitor requests to the project team’s review and delivery work. Owners configure the public board, visitors submit and follow requests, and members moderate or link them to issues. Keep public replies, internal notes and separately published pages or views distinct when managing access.

## Publish a feedback board {#publish-a-feedback-board}

Open Feedback in project settings as the owner. Complete the setup if no board exists, then enable the public-board channel. Copy its public URL and open it in a signed-out browser to check the visitor view. Members can inspect settings but cannot change publication, rotate tokens or manage the SSO secret.

Choose whether visitors identify by email code or through configured SSO. Configure public comments, category display and any selected public page or view tabs. Review visible data before distributing the URL. Visitors can read without identification; posting, voting and commenting need a board identity. Public representations do not expose visitor email or real name, but the team can handle identified feedback privately.

### Publication and ingestion are separate {#channels}

Turning off the board makes its visitor pages unavailable. Server-to-server ingestion uses a separate feedback integration key and can continue without a public board. A post's public choice, review state and spam status also govern its visibility; “board enabled” alone does not publish every post.

Optional Numo review applies to submitted feedback and depends on project/instance settings, providers and owner usage. With review enabled, submissions wait for review before publication; with it disabled they are not held for a nonexistent review. Check the review queue after a demo submission. Numo sends public replies only when explicitly requested.

![Enabled public feedback board with local SSO identity configured and its URL concealed.](/documentation/en/publish-a-feedback-board-workflow.png)

## Submit, vote and follow feedback {#submit-and-follow-feedback}

Open the board's public URL. You can read public posts without a minddy account. To submit, vote or comment, identify through the board's email-code flow or the product's SSO link. Email-code delivery depends on the instance's email service. A code lasts ten minutes and allows five attempts; wait at least sixty seconds before requesting another. Never share the code.

Search existing requests before posting. Write a specific title and describe the need and its context. Titles allow 200 characters and bodies 10,000. The public option is selected by default; clear it to send the request privately to the team. Review the text for secrets before submitting. Optional moderation can keep the request pending before it appears publicly.

### Vote, comment and follow {#follow}

Vote on an existing request instead of duplicating it. Your identity has one vote per post. Comments require identification and enabled public comments; the public comment limit is 5,000 characters. You can remove your own comment; the team can moderate public comments.

Open My feedback to find your submitted requests and votes, including what your current identity can see. Read the public status and team replies there or on the request. Team-only notes are not public replies. If SSO expired, return through a fresh product link; changing browser or identity can change the personal list.

![Visitor feedback form with a title, description and public visibility enabled.](/documentation/en/submit-and-follow-feedback-workflow.png)

## Review feedback privately and reply publicly {#moderate-feedback}

Project members open the project's Feedback surface and select a request from the review queue or list. Read the original submission, public/private choice, review state and any moderation or duplicate suggestion. Canonical title and body can be clarified while submitted originals remain preserved. Assign categories and a suitable public status; spam never appears on the public board. A private request remains separate from a merely pending public one.

Optional translation is shown beside the source for the team; the public board keeps the written feedback. Check any AI classification before relying on it. If a post is linked to an issue, its status is controlled by that issue and cannot be edited independently.

### Notes and public responses {#responses}

Choose internal discussion for team notes. Public replies are visible to visitors; check visibility before sending. Replies inherit their thread's visibility, so an internal composer choice cannot make a reply inside a public thread private. Numo public answers need an explicit request; mentioning Numo in a public comment does not trigger an automatic reply.

Team members can delete public comments for moderation. Editing stays with the author, and visitor words are never rewritten by the team. Internal comments retain author-only rules. After a public reply or moderation action, inspect the signed-out board to confirm the intended visibility.

![Feedback detail showing a public team reply and an internal note.](/documentation/en/moderate-feedback-workflow.png)

## Merge feedback and connect it to delivery {#feedback-to-issue}

As a project member, open the feedback request and choose merge into an existing canonical request from the same project. Read both needs first: similar wording is not proof of the same outcome. The current request becomes the duplicate, votes unite by identity and the duplicate redirects to the canonical request. Review the merge activity; the undo action uses that merge event. Reject an incorrect AI merge suggestion rather than accepting it just to clear the queue.

### Create or link work {#work}

Promote a request to a new issue when work is not already tracked. Review the creation fields before confirming; without supplied fields the default promotion creates backlog work. If an issue already exists, use the link action instead. A post already linked cannot be promoted again. Unlinking keeps the last public status and stops the issue relationship.

Linked status follows the issue: triage/backlog/duplicate → open; todo → planned; in_progress/in_review → in_progress; done → shipped; canceled → declined. Moving work back to backlog also reopens the feedback status. Inspect the linked issue and signed-out request after changing a state.

Team notifications on incoming feedback depend on its source and review transition. Do not promise a voter an automatic email for every merge or issue update; check public status and replies in My feedback. A link makes progress visible without exposing the private issue itself.

![Feedback linked to a newly created issue with Planned status.](/documentation/en/feedback-to-issue-workflow.png)

## Add public pages and views to a feedback board {#feedback-pages-and-views}

As project owner, first publish the intended project page or share the intended view at public visibility. Check the content for private information. Open Feedback settings, enable the page or view family and select each item that should appear. Both the family switch and per-item selection are required.

The settings list can contain protected shares, but public navigation includes only public-level shares. Selecting a protected page does not bypass its protection or expose its name in a board tab. A published item from another project is not part of this project's tab list.

### Verify and remove access {#visibility}

Open the board signed out. Follow the tabs to selected views and pages and confirm their titles and contents. Navigation is shared among the board, public views and public pages when configured; a lone tab is not displayed as navigation.

To remove a tab, deselect the item or turn off its family. That removes navigation, not the underlying share. Revoke or change the actual share to remove direct-link access. Disabling the board also disables its coupled navigation, but does not independently revoke every page or view share. Verify both the board tab and original share URL after changing publication.

![Published feedback guide selected in the board navigation and readable without sign-in.](/documentation/en/feedback-pages-and-views-workflow.png)
