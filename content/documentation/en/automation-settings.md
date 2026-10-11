---
{
  "id": "automation-settings",
  "locale": "en",
  "title": "From automations to routines",
  "summary": "Review paused migration proposals before enabling event-driven Numo work.",
  "topic": "Account and apps",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "A05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-11",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677)",
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
      "components/settings/smart-assign-section.tsx",
      "content/knowledge/settings-and-data.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/min-677-routines.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root (MIN-677 source review and isolated PostgreSQL regressions; unchanged procedures retain prior evidence)",
    "language": "agent:/root (en translation, label and retained-meaning self-review)",
    "date": "2026-10-11"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Configure automatic issue work"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Review migrated work {#automation-settings}

Project automation switches and account presets, effort switches and start-delay settings have been replaced by [Routines](/docs/scheduled-routines). Open Routines as the project owner. Enabled rules from the archive are proposed once as paused routines; opening the list does not enable them or spend an execution budget.

Review each proposal's instruction, status trigger, conditions, delay and spending cap. The original workflow is retained in the instruction for comparison. Check human checkpoints and any unavailable references before enabling it. Proposals require owner input at human checkpoints and default to a 15% monthly-budget cap per occurrence. They are not a silent continuation of the old chain. Pending chains and chains waiting for a human stop; already running code work can finish or be stopped in its conversation, without a successor chain step. Historical activity and account backups retain the archive.

## Keep other project helpers distinct {#mechanisms}

Smart Fill still fills missing priority, effort, categories and objective. Smart Assign remains an owner-controlled project setting with member rules. Smart Triage remains a static rules engine. Automatic self-assignment remains a separate preference. These helpers do not activate a migrated proposal.

Test a reviewed routine manually, inspect its private conversation and budget, then enable it to listen to future events. If unexpected work starts, pause the routine and inspect the occurrence before retrying. The [routine guide](/docs/scheduled-routines#conditions) explains waiting conditions and invalidation.
