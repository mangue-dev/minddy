---
{
  "id": "trash-and-recovery",
  "locale": "en",
  "title": "Trash and recovery",
  "summary": "Find a deleted object, restore its dependencies and distinguish permanent removal.",
  "topic": "Plan and find work",
  "type": "guide",
  "audiences": [
    "member",
    "owner"
  ],
  "workflows": [
    "W19"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "app/(app)/trash/page.tsx",
      "content/knowledge/productivity.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "pages",
    "accounts",
    "projects"
  ],
  "aliases": [],
  "tags": [
    "Restore deleted work"
  ],
  "figures": [
    {
      "id": "trash-and-recovery-steps",
      "kind": "screenshot",
      "src": "/documentation/en/reader-trash.png",
      "alt": "Recoverable demonstration issue with thirty days remaining in trash.",
      "caption": "Use the row’s actions to restore the issue. Emptying trash is a separate permanent operation.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1280,
        1080
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "trash-and-recovery-steps"
  ]
}
---

## Find and restore an item {#trash-and-recovery}

Open Trash from the account menu. It contains recoverable deleted work, including supported issues, objectives, feedback, routines, projects and pages. Check the item type, deletion time and remaining retention shown in the interface before choosing restore.

Restore the required parent or container first when the item depends on one. For example, restore a deleted database before an entry deleted separately from it. Reopen the restored destination and inspect its content and properties. Deleted items remain recoverable for 30 days before retention removes them permanently. Only the project owner can restore or permanently remove a project or routine. Project members can restore or remove the other supported project objects while they retain access.

![Recoverable demonstration issue with thirty days remaining in trash.](/documentation/en/reader-trash.png)

## Permanent deletion and failed recovery {#permanent-removal}

Permanent removal and emptying the trash cannot be undone. Read the confirmation and item count before proceeding; these controls are not ordinary ways to hide finished work. An item beyond the available retention may no longer be recoverable through the interface.

If restoration fails, read the error and check that the owning project or parent exists and you still have access. Do not repeatedly purge or recreate objects to resolve a restore conflict. Export important data before account-level deletion; account deletion has a different consequence from placing one object in the recoverable trash.
