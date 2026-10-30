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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "components/cycle/use-cycle-menu-actions.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/cycle/cycle-empty-states.tsx",
      "components/global-board.tsx"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; 1 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:claude-code (en manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "alt": "Personal cycle for Oct 12 – 25 with an empty Backlog and Aurora and Beacon issues in Todo and In progress.",
      "caption": "The cycle gathers issues assigned to you across projects. Adding an issue assigns it to the cycle owner without changing its status.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1314,
        1046
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "personal-cycle-steps"
  ]
}
---

## Configure and fill your cycle {#personal-cycle}

Enable cycles in **Account settings** → **Cycles**, or open Cycle from the command palette and choose **Activate cycles** there. Once they are on, a **Cycle** tab appears in the view bar of **All issues**, and a project board's **Cycle** tab, marked with an arrow, leads to the same personal cycle; while cycles are off, boards show no **Cycle** tab. It belongs to your account and can contain issues assigned to you in projects where you are the owner or a Member. Readers cannot be assigned, so a project you only read contributes no work. It is not a project sprint and does not belong to a team objective.

Choose a duration of one or two weeks, the starting weekday, one to four upcoming cycles and light, medium or heavy intensity. These settings determine your personal period and target capacity. The automatic-capture switches control whether assigned issues enter the current cycle when they start or finish.

The current cycle is filled automatically once from eligible work. To add an issue manually, use its menu’s cycle action and choose the current or next period when available. Adding an issue assigns it to the cycle owner without changing its status. Triage, done, canceled and duplicate issues cannot be added through this action. Inspect the assignee and blockers after adding work; removing an issue from the cycle keeps the issue in its project.

![Personal cycle for Oct 12 – 25 with an empty Backlog and Aurora and Beacon issues in Todo and In progress.](/documentation/en/reader-cycle.png)

## Finish or adjust the period {#cycle-results}

Update issue statuses as work progresses and inspect completed versus remaining work. At a period boundary, unfinished eligible issues from past cycles move into the current cycle automatically; their assignment is preserved. This carry-over does not mark them complete. When every issue of the current cycle is closed, a **Cycle completed** banner offers **Refill cycle** to add eligible work; the cycle is not refilled automatically during the period. Use the date selector to inspect past and upcoming cycles; these views are read-only, while the current cycle supports changes.

If a prerequisite is pulled into the current cycle to keep dependencies coherent, inspect why it was added before removing it. An issue that vanishes after completion may still be visible in completed cycle work or by identifier. Account cycle settings affect your planning surface, not another member’s personal cycle.
