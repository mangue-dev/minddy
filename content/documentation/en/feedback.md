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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-10",
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
      "lib/server/feedback/public-nav.ts",
      "content/documentation/reviews/premerge-en-fr-2026-10-10.md",
      "content/documentation/reviews/premerge-light-review-2026-10-10.md",
      "app/f/[token]/voice/route.ts",
      "app/f/[token]/feedback-board-client.tsx",
      "lib/server/feedback/voice.ts",
      "lib/server/feedback/voice-limits.ts",
      "supabase/migrations/20270106320000_atomic_public_feedback_and_share_limits.sql",
      "content/documentation/reviews/premerge-de-es-2026-10-10.md",
      "content/documentation/reviews/premerge-it-pt-BR-2026-10-10.md",
      "content/documentation/reviews/min-670-feedback-objectives.md"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun); agent:/root with agent:/root/review_en_fr (light pre-merge source and retained-claim review; existing operational evidence retained; no operational rerun); agent:/root (MIN-670 source, en wording and new-control review; existing procedural evidence retained)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review); agent:/root/review_en_fr with agent:/root (en pre-merge wording, correction and retained-meaning review); agent:/root (MIN-670 source, en wording and new-control review; existing procedural evidence retained)",
    "date": "2026-10-10"
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
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        816,
        378
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/submit-and-follow-feedback-workflow.png",
      "alt": "Visitor feedback form with a title, description and public visibility enabled.",
      "caption": "A signed-in visitor submits a need and chooses whether it appears publicly. The example was actually submitted with automatic review disabled.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        625,
        369
      ],
      "theme": "light",
      "padding": 24
    },
    {
      "id": "feedback-objective-selection",
      "kind": "screenshot",
      "src": "/documentation/en/feedback-objective-selection.png",
      "alt": "Component preview of the feedback objective selector and a feedback integration default, both set to Docs.",
      "caption": "Objective selectors with demonstration data. New feedback inherits the integration default.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-10",
      "viewport": [
        680,
        301
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/feedback-pages-and-views-workflow.png",
      "alt": "Published feedback guide selected in the board navigation and readable without sign-in.",
      "caption": "Publish a page, enable page tabs and select it for the board. This demonstration page was opened anonymously; the opaque URL keeps `noindex`.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1148,
        388
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "publish-a-feedback-board-workflow",
    "submit-and-follow-feedback-workflow",
    "feedback-objective-selection",
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

Use the microphone in the submission form to dictate the title and description. Identify through the board first, allow microphone access, then stop recording and review the text before choosing Send. Dictation fills the draft; it does not submit the request. Availability depends on the instance’s voice configuration, working providers and the project owner’s AI budget. Usage is charged to that owner under their provider settings, rather than to the visitor’s account.

Public-board recordings are limited to 10 MiB. Transcription allows 20 requests per identified visitor and 40 per IP address per hour, per board; draft interpretation has a separate limit of 40 requests per visitor per hour. These are separate from account dictation limits. For a rate-limit message, wait before retrying; if voice is unavailable, type the request instead.

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

### Choose an objective for feedback {#feedback-objective}

As a project member, choose **Objective** in the feedback properties, or when creating internal feedback. Choose **None** to remove the link. The objective must belong to this project. Open the objective to see its linked feedback; follow a request to read its discussion. This association is internal and does not expose private objectives on the public board. It does not count as issue progress.

The project owner can choose an optional objective when creating a feedback integration in **Settings → Integrations**, or change it beside an existing feedback integration. New API submissions inherit that objective, including with `analyze: false`; changing the default does not move existing feedback. If the objective is in the trash, choose an active objective or clear the default before submitting again. Numo never chooses an objective during feedback review. Ask Numo explicitly to link or unlink a request when you want its help.

Promotion starts the new issue with the feedback objective and categories. You can change them in the creation form. If no objective was chosen, promotion keeps it empty, even with Smart Fill enabled. Changing a feedback objective later does not move an already linked issue. Feedback can merge only when both requests have the same objective, including both having none; align their objectives first if the team decides they describe the same need.

![Component preview of the feedback objective selector and a feedback integration default, both set to Docs.](/documentation/en/feedback-objective-selection.png)

## Merge feedback and connect it to delivery {#feedback-to-issue}

As a project member, open the feedback request and choose merge into an existing canonical request from the same project. Read both needs first: similar wording is not proof of the same outcome. The current request becomes the duplicate, votes unite by identity and the duplicate redirects to the canonical request. Review the merge activity; the undo action uses that merge event. Reject an incorrect AI merge suggestion rather than accepting it just to clear the queue.

### Create or link work {#work}

Promote a request to a new issue when work is not already tracked. Review the creation fields before confirming; without supplied fields the default promotion creates `backlog` work. If an issue already exists, use the link action instead. A post already linked cannot be promoted again. Unlinking keeps the last public status and stops the issue relationship.

Linked status follows the issue: `triage`/`backlog`/`duplicate` → `open`; `todo` → `planned`; `in_progress`/`in_review` → `in_progress`; `done` → `shipped`; `canceled` → `declined`. Moving work back to `backlog` also reopens the feedback status. Inspect the linked issue and signed-out request after changing a state.

Team notifications on incoming feedback depend on its source and review transition. Do not promise a voter an automatic email for every merge or issue update; check public status and replies in My feedback. A link makes progress visible without exposing the private issue itself.


## Add public pages and views to a feedback board {#feedback-pages-and-views}

As project owner, first publish the intended project page or share the intended view at public visibility. Check the content for private information. Open Feedback settings, enable the page or view family and select each item that should appear. Both the family switch and per-item selection are required.

The settings list can contain protected shares, but public navigation includes only public-level shares. Selecting a protected page does not bypass its protection or expose its name in a board tab. A published item from another project is not part of this project's tab list.

### Verify and remove access {#visibility}

Open the board signed out. Follow the tabs to selected views and pages and confirm their titles and contents. Navigation is shared among the board, public views and public pages when configured; a lone tab is not displayed as navigation.

To remove a tab, deselect the item or turn off its family. That removes navigation, not the underlying share. Revoke or change the actual share to remove direct-link access. Disabling the board also disables its coupled navigation, but does not independently revoke every page or view share. Verify both the board tab and original share URL after changing publication.

![Published feedback guide selected in the board navigation and readable without sign-in.](/documentation/en/feedback-pages-and-views-workflow.png)
