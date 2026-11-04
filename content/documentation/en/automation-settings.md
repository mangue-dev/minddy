---
{
  "id": "automation-settings",
  "locale": "en",
  "title": "From automations to routines",
  "summary": "Understand what happened to project automations and recreate a workflow as an owner-controlled routine.",
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
  "revision": 10,
  "sourceRevision": 10,
  "owner": "@mangue-dev",
  "updatedAt": "2026-11-04",
  "compatibility": {
    "version": "0.30.0 (MIN-794 release review)",
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
      "lib/server/usage.ts"
    ]
  },
  "review": {
    "revision": 10,
    "fact": "agent:claude-code (Aligned quoted UI labels with the MIN-885 copy audit, checked against messages/*.json; not checked in the running app; rest of the article unchanged since the previous review; no figure recaptured); agent:claude-code (0.30.0 release review, MIN-794: its evidence changes in the v0.20.0..0.30.0 delta were documented by the pull requests that made them; the article was updated by pull requests in that delta; not re-audited line by line; 0 screenshot(s) recaptured on 2026-11-04 from a local candidate against the preview demo account and inspected; no browser walkthrough of the procedures)",
    "language": "agent:claude-code (en changed passages with catalog UI labels; self-reviewed; agent review, not human acceptance)",
    "date": "2026-11-04"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Recreate a project automation as a routine"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## What happened to project automations {#automation-settings}

Project automation switches and account presets, effort switches and start-delay settings have been replaced by [Routines](/docs/scheduled-routines). Automation rules configured in an earlier version no longer run, and minddy does not convert them into routines. Chains that were pending or waiting for a human were stopped without a successor step. The archived rules stay with the project and in account exports.

To keep a workflow, open Routines as the project owner and [create a routine](/docs/scheduled-routines#scheduled-routines) with the instruction, trigger, conditions and delay it needs.

## Keep other project helpers distinct {#mechanisms}

Smart Fill still fills missing priority, effort, categories and objective. Smart Assign remains an owner-controlled project setting with member rules. Smart Triage remains a static rules engine. Automatic self-assignment remains a separate preference. These helpers are separate from routines and do not replace a retired automation.

Test a new routine manually, inspect its private conversation and budget, then enable it to listen to future events. If unexpected work starts, pause the routine and inspect the occurrence before retrying. The [routine guide](/docs/scheduled-routines#conditions) explains waiting conditions and invalidation.
