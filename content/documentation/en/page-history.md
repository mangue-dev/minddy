---
{
  "id": "page-history",
  "locale": "en",
  "title": "Inspect and restore a page version",
  "summary": "Preview saved history before replacing the current document.",
  "topic": "Pages and databases",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "P05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
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
      "components/pages/page-history.tsx",
      "lib/server/page-versions.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent primary-source comparison)",
    "language": "agent:/root/automation_account_documentation (independent complete article review)",
    "date": "2026-10-08"
  },
  "related": [
    "page-editor",
    "create-and-organize-pages",
    "trash-and-recovery"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "page-history-steps",
      "kind": "screenshot",
      "src": "/documentation/en/page-history-preview.png",
      "alt": "Versions tab with an expanded earlier state, its author, Restore and the 30-day retention notice.",
      "caption": "Preview a saved state and compare it with the current page before restoring.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        900
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "page-history-steps"
  ]
}
---

## Inspect saved versions {#page-history}

Open the page's save/history indicator to view versions, or its comments/activity control to inspect actions. These tabs answer different questions: a saved version is a document state, while activity can include renaming, deletion or restoration without the same content snapshot.

Select a version to preview it before restoring. The history identifies authors and agent activity, so compare the content with the change you intend to undo. The interface announces a 30-day history window; do not treat history as a permanent external backup.

## Restore and verify {#restore-page-version}

As an authorized project member, restore the selected version only after reviewing the current content it will replace. The pre-restore state itself enters history, which supports recovering that state later while it is retained.

Reopen or refresh the page editor after restoration and check its actual body. A previously open editor holds an outdated version and must not blindly overwrite the restored state. Page versions are not complete instance backups: attachment bytes, deleted files or related objects can have separate lifecycles. Use the file and operator recovery guides when the missing information is outside the saved document body.


![Versions tab with an expanded earlier state, its author, Restore and the 30-day retention notice.](/documentation/en/page-history-preview.png)
