---
{
  "id": "personal-statistics",
  "locale": "en",
  "title": "Personal statistics",
  "summary": "Compare completion activity and time measurements within their actual scope.",
  "topic": "Plan and find work",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W18"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
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
      "app/(app)/statistics/page.tsx",
      "components/stats/effort-durations.tsx",
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (en editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "personal-cycle",
    "objectives",
    "ai-settings-and-usage"
  ],
  "aliases": [],
  "tags": [
    "Read your personal work statistics"
  ],
  "figures": [
    {
      "id": "personal-statistics-steps",
      "kind": "screenshot",
      "src": "/documentation/en/reader-statistics.png",
      "alt": "Personal statistics showing the annual activity grid, breakdowns, work rhythm and all-time totals.",
      "caption": "This demonstration account has one completed issue and eleven created issues. The displayed statistics are real; project and objective names were localized for display.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        994,
        1046
      ],
      "theme": "light",
      "padding": 24
    }
  ],
  "requiredFigures": [
    "personal-statistics-steps"
  ]
}
---

## Open and read the statistics {#personal-statistics}

Open Statistics from your account navigation. Read the annual activity grid, the breakdowns by project, category and objective, the rhythm section and the all-time totals. The page shows its configured periods; it has no date-range filter to select another interval. The surface summarizes your work rather than establishing another member's performance ranking.

Use completed issue counts, pace, active days, streaks and time measurements to inspect your own activity. The activity grid counts issue-completion and notebook-task-completion events, grouped into calendar days in your time zone. An active day has at least one such event; the current streak tolerates an empty today but ends at the next empty day. All-time completed-issue totals deduplicate issue identifiers, so an event count and a distinct-issue total answer different questions.

Time by effort is the median elapsed time from an issue’s first recorded move to in progress until completion, for eligible done issues assigned to you with an effort and both timestamps. It includes elapsed waiting time; it is not a stopwatch of hours worked. The quantity view shows the underlying sample size. A missing median can reflect no eligible measurements rather than zero duration. Read the unit and the period each section describes before comparing values.

## Interpret sparse or changed data {#statistics-limits}

An empty period can mean no matching completed work or insufficient activity. It does not prove the account has no issues. Changes in effort labels, scope or work mix can change the comparison without proving you became faster or slower.

Numo can read your statistics through its read-only statistics tools and explain the same numbers. Its access to plan usage or recent executions is also read-only; it cannot change your budget merely by reporting it. For an AI cost problem, open the usage and account settings instead of changing an issue's effort to hide the measurement.


![Personal statistics showing the annual activity grid, breakdowns, work rhythm and all-time totals.](/documentation/en/reader-statistics.png)
