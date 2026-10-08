---
{
  "id": "issue-dependencies",
  "locale": "en",
  "title": "Link dependencies and related issues",
  "summary": "Express which work blocks another task and distinguish relations from hierarchy.",
  "topic": "Projects and issues",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W05"
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
      "content/knowledge/core-tracker.md",
      "components/issue-side-panel.tsx",
      "components/issue-indicators.tsx",
      "captures/shots/relations/intent.md",
      "lib/server/issue-relations.ts",
      "lib/relation-constants.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "sub-issues",
    "issue-statuses",
    "objective-dependencies-and-momentum"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "issue-dependencies-steps",
      "kind": "screenshot",
      "src": "/documentation/en/work-dependencies.png",
      "alt": "Search for a blocker by issue identifier.",
      "caption": "Choose the relation direction before selecting its endpoint. The picker is shown without submitting a relation.",
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
    "issue-dependencies-steps"
  ]
}
---

## Choose the relation and its direction {#issue-dependencies}

Open an issue's relations controls and find the other issue by title or identifier. Choose a blocking relation when one task must finish before another can proceed. If A blocks B, A is the prerequisite and B is blocked by A. A related relation adds context without imposing that order.

Read both issue identifiers and the displayed direction before confirming. For example, “Prepare the endpoint” blocks “Connect the client”, rather than the reverse. A dependency does not make either issue a sub-issue, and a parent-child relation is not a substitute for a blocking relation.

![Search for a blocker by issue identifier.](/documentation/en/work-dependencies.png)

## Resolved and inherited blockers {#blocker-state}

Terminal statuses done, canceled and duplicate stop an issue from blocking work. Relations connect issues or objectives in the same project; both endpoints must be accessible there. They do not link arbitrary private work across projects or publish either endpoint.

An open issue can inherit a blocker through its open objective. If A blocks objective B, open issues attached to B show A as an inherited blocker, even without a direct A-to-issue relation. The display names the actual blocker and the objective responsible for inheritance. Inspect that objective relation before trying to unlink it from the issue. Closing A, closing B or moving the issue out of B removes that inherited blockage. This mechanism follows objective membership, not the parent/sub-issue hierarchy.

Remove a relation from the relations controls when its meaning no longer applies, then verify both the label and the blocked indicator. Marking an issue as a duplicate has lifecycle semantics and points to retained work; use it for duplicated tasks rather than creating an ordinary related link and assuming that closes the duplicate.

If the relation picker cannot find an issue, check project access and the identifier. Do not expose another project's content by pasting a private issue URL into a public feedback reply.
