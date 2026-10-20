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
  "revision": 8,
  "sourceRevision": 8,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
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
      "components/stats/profile-statistics.tsx",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-settings-page.tsx",
      "components/stats/effort-durations.tsx",
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql",
      "supabase/migrations/20270109200067_stats_distinct_year.sql",
      "lib/settings-sections.ts",
      "components/app-sidebar.tsx",
      "app/(app)/statistics/page.tsx",
      "components/stats/stats-hero.tsx"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-20"
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
      "src": "/documentation/en/personal-statistics-workflow.png",
      "alt": "Profile statistics with the figure strip, the 12-month activity grid, the breakdowns by project and category, and the work rhythm.",
      "caption": "The demonstration account's real history: six completed issues in two projects, thirty created issues, no notebook task checked off.",
      "revision": 8,
      "reviewed": true,
      "capturedAt": "2026-10-20",
      "viewport": [
        816,
        999
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "personal-statistics-steps"
  ]
}
---

## Open and read the statistics {#personal-statistics}

Your statistics are in the **Profile** tab of account settings. Choose your name at the top of the account menu to open it directly. **Account settings** opens on **Preferences**; from there, select **Profile**, the first tab. The statistics appear under your avatar, name and email. The former `/statistics` address now opens this tab.

A strip of six figures comes first: **Completed**, **Tasks checked off**, **Created**, **Projects**, **Longest streak** and **Current streak**. It replaces the former all-time totals section. Below it, read the 12-month headline and activity grid, then **Where your work went**, with breakdowns by project, category and objective, and **Work rhythm**, with **Current workload**, **Issues per cycle**, **Due-date gap** and **Breakdown by effort**. **Issues per cycle**, **Due-date gap** and **Breakdown by effort** appear only when they have data. The tab shows its configured periods; it has no date-range filter to select another interval. The surface summarizes your work rather than establishing another member's performance ranking.

Use completed issue counts, pace, active days, streaks and time measurements to inspect your own activity. The activity grid counts issue-completion and notebook-task-completion events, grouped into calendar days in your time zone. The grid never scrolls: it shows the most recent weeks that fit the screen, so a phone shows fewer months than a computer. An active day has at least one such event; the current streak tolerates an empty today but ends at the next empty day. The **Completed** figure deduplicates issue identifiers: moving the same issue to Done twice still counts once, so an event count and a distinct-issue total answer different questions. The headline above the grid adds the issues and notebook tasks you completed over the last 12 months; point to its number to see the split into issues, tasks and active days. It also counts each issue once over those 12 months: an issue completed again marks each of its days in the grid but adds one issue to the headline.

Time by effort is the median elapsed time from an issue’s first recorded move to in progress until completion, for eligible done issues assigned to you with an effort and both timestamps. It includes elapsed waiting time; it is not a stopwatch of hours worked. The **Issue count** view shows the underlying sample size. A missing median can reflect no eligible measurements rather than zero duration. Read the unit and the period each section describes before comparing values.

## Interpret sparse or changed data {#statistics-limits}

An account that has not yet created or completed an issue, or checked off a notebook task, sees **Nothing to measure yet** instead of the figures, with a **New issue** button, or **Create the first project** when it has no project to create an issue in. An empty period can mean no matching completed work or insufficient activity. It does not prove the account has no issues. Changes in effort labels, scope or work mix can change the comparison without proving you became faster or slower.

Numo can read your statistics through its read-only statistics tools and explain the same numbers. Its access to plan usage or recent executions is also read-only; it cannot change your budget merely by reporting it. For an AI cost problem, open the usage and account settings instead of changing an issue's effort to hide the measurement.


![Profile statistics with the figure strip, the 12-month activity grid, the breakdowns by project and category, and the work rhythm.](/documentation/en/personal-statistics-workflow.png)
