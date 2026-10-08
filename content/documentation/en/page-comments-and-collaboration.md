---
{
  "id": "page-comments-and-collaboration",
  "locale": "en",
  "title": "Discuss a page and handle conflicts",
  "summary": "Use anchored comment threads and understand the difference between presence and saved edits.",
  "topic": "Pages and databases",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P03"
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
      "components/pages/page-comment-popover.tsx",
      "components/pages/page-presence.tsx",
      "components/pages/page-conflict-banner.tsx",
      "lib/pages-merge.ts",
      "components/pages/page-view.tsx"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "page-history",
    "page-editor",
    "notifications-and-inbox"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-comments-and-collaboration-steps",
      "kind": "screenshot",
      "src": "/documentation/en/page-comments.png",
      "alt": "Page activity dialog with a demonstration edit event and an empty comment composer.",
      "caption": "Read page activity and write a comment in the composer. No comment has been submitted in this example.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        600
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-comments-and-collaboration-steps"
  ]
}
---

## Add and resolve a thread {#page-comments-and-collaboration}

Open a project page and its comment controls. Select relevant content when creating an anchored comment, explain the question or proposed change, and use mentions to involve a project member. Reply in the thread to keep the decision with the context it concerns. Resolve a thread when its question has actually been addressed.

Presence avatars identify people viewing the page. They do not prove that another person's unsaved text has reached the server or that simultaneous edits are merged automatically. Read the current save state before navigating away.


![Page activity dialog with a demonstration edit event and an empty comment composer.](/documentation/en/page-comments.png)

## Recover a save conflict {#page-conflict}

Minddy merges edits to different top-level document blocks when it can preserve both changes. It does not merge simultaneous text edits inside the same block character by character. If both people changed that block, the document retains the remote version and a banner offers your previous block for review.

Compare the named block with the current document. Choose Restore mine only when replacing that block with your version is intended. If your conflicting action was a deletion, Delete it again applies that deletion explicitly. Dismiss keeps the adopted document and closes the warning; it does not restore your version. Preserve any wanted text before dismissing, and use history to inspect saved versions when a broader recovery is needed. These choices affect the identified block rather than blindly replacing the whole page.

A missing thread anchor can follow document edits; read the discussion before moving or deleting the referenced block. Comments and activity are internal to the project unless content is explicitly published through a supported sharing path. Use a published-page test to determine the visitor's actual view rather than assuming that project collaboration controls become public.
