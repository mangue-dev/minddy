---
{
  "id": "personal-cycle",
  "locale": "en",
  "title": "Personal cycles",
  "summary": "Select work across projects for a weekly or fortnightly planning period.",
  "topic": "Plan and find work",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W12"
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
      "content/knowledge/productivity.md",
      "components/cycle/cycle-header.tsx",
      "components/settings/account-cycles-section.tsx",
      "lib/cycle-prefs.ts",
      "lib/server/cycles.ts",
      "components/cycle/use-cycle-menu-actions.tsx"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "views",
    "issues"
  ],
  "aliases": [],
  "tags": [
    "Plan a personal cycle"
  ],
  "figures": [
    {
      "id": "personal-cycle-steps",
      "kind": "screenshot",
      "src": "/documentation/en/reader-cycle.png",
      "alt": "A demonstration issue in the personal cycle’s backlog.",
      "caption": "Adding the issue to this cycle assigned its owner while preserving backlog status.",
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
    "personal-cycle-steps"
  ]
}
---

## Configure and fill your cycle {#personal-cycle}

Enable cycles in Account settings → Cycles, then open Cycle from personal navigation. It belongs to your account and can contain issues from multiple projects you can access. It is not a project sprint and does not belong to a team objective.

Choose a duration of one or two weeks, the starting weekday, one to four upcoming cycles and light, medium or heavy intensity. These settings determine your personal period and target capacity. The automatic-capture switches control whether assigned issues enter the current cycle when they start or finish.

The current cycle is filled automatically once from eligible work. To add an issue manually, use its menu’s cycle action and choose the current or next period when available. Adding an issue assigns it to the cycle owner without changing its status. Triage, done, canceled and duplicate issues cannot be added through this action. Inspect the assignee and blockers after adding work; removing an issue from the cycle keeps the issue in its project.

![A demonstration issue in the personal cycle’s backlog.](/documentation/en/reader-cycle.png)

## Finish or adjust the period {#cycle-results}

Update issue statuses as work progresses and inspect completed versus remaining work. At a period boundary, unfinished eligible issues from past cycles move into the current cycle automatically; their assignment is preserved. This carry-over does not mark them complete. Use the date selector to inspect past and upcoming cycles; these views are read-only, while the current cycle supports changes.

If a prerequisite is pulled into the current cycle to keep dependencies coherent, inspect why it was added before removing it. An issue that vanishes after completion may still be visible in completed cycle work or by identifier. Account cycle settings affect your planning surface, not another member’s personal cycle.
