---
{
  "id": "objective-dependencies-and-momentum",
  "locale": "en",
  "title": "Interpret objective dependencies and momentum",
  "summary": "Read blockers and activity signals without treating estimates as delivery guarantees.",
  "topic": "Projects and issues",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W11"
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
      "components/objective-relations-section.tsx",
      "components/objective-momentum.tsx",
      "content/knowledge/core-tracker.md",
      "lib/relation-constants.ts",
      "lib/server/issue-relations.ts",
      "lib/objective-momentum.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [
    "objectives",
    "issue-dependencies",
    "personal-statistics"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "objective-dependencies-and-momentum-steps",
      "kind": "screenshot",
      "src": "/documentation/en/reader-objective-momentum.png",
      "alt": "Objective momentum after an actual demonstration completion.",
      "caption": "Read momentum alongside the linked work. This history is insufficient to show an estimated finish date.",
      "revision": 2,
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
    "objective-dependencies-and-momentum-steps"
  ]
}
---

## Inspect relations and blockers {#objective-dependencies-and-momentum}

Open the objective and its relations. Check which outcome depends on another and read blocking issue relationships where they explain the constraint. Parent-child organization, a related link and a blocking dependency answer different questions; inspect the direction before changing a relation.

A blocking relation may connect an issue or another objective to this objective, within the same project. Its open member issues inherit the unresolved blocker: the displayed relation identifies both the actual prerequisite and the objective passing it on. This is not a new direct relation stored on every issue. Closing the blocker or the blocked objective, or removing an issue from that objective, removes the corresponding inherited blockage. Resolve the actual prerequisite or correct an obsolete relation. Merely changing an objective's target date does not complete its blocking issues.

## Interpret the momentum signal {#momentum}

Momentum summarizes recently completed work. It can be accelerating, steady, slowing or stalled, with separate states for not-started, complete and canceled objectives. Use it to identify an outcome needing attention, then read the underlying issues and activity.

An estimated finish date requires at least two completions, a full observed week, positive delivered effort and remaining work. Only currently linked issues contribute; a completion predating objective creation does not manufacture recent momentum. With a valid target, history spans creation to that date and throughput uses observed time since creation, including time after a missed target. Without a valid target, the calculation uses a rolling eight-week history and a 28-day forecast window. Sparse history or a recent scope change reduces its usefulness. The estimate is not a promised deadline and does not include unseen work you have not attached. Compare the target date, remaining work and actual constraints before changing commitments.

![Objective momentum after an actual demonstration completion.](/documentation/en/reader-objective-momentum.png)
