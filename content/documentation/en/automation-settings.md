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
      "components/settings/smart-assign-section.tsx",
      "content/knowledge/settings-and-data.md",
      "lib/server/usage.ts"
    ]
  },
  "review": {
    "revision": 8,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history)",
    "language": "agent:/root/min747 (en changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance)",
    "date": "2026-10-20"
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

Project automation switches and account presets, effort switches and start-delay settings have been replaced by [Routines](/docs/scheduled-routines). Automation rules configured in an earlier version no longer run, and Minddy does not convert them into routines. Chains that were pending or waiting for a human were stopped without a successor step. The archived rules stay with the project and in account exports.

To keep a workflow, open Routines as the project owner and [create a routine](/docs/scheduled-routines#scheduled-routines) with the instruction, trigger, conditions and delay it needs.

## Keep other project helpers distinct {#mechanisms}

Smart Fill still fills missing priority, effort, categories and objective. Smart Assign remains an owner-controlled project setting with member rules. Smart Triage remains a static rules engine. Automatic self-assignment remains a separate preference. These helpers are separate from routines and do not replace a retired automation.

Test a new routine manually, inspect its private conversation and budget, then enable it to listen to future events. If unexpected work starts, pause the routine and inspect the occurrence before retrying. The [routine guide](/docs/scheduled-routines#conditions) explains waiting conditions and invalidation.
