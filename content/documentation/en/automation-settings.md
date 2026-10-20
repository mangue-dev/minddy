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
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-16",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677); MIN-721 removal of Numo code work",
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
    "revision": 7,
    "fact": "agent:/root (MIN-677 source review and isolated PostgreSQL regressions; unchanged procedures retain prior evidence); agent:/root/min721_docs (MIN-721 source review: running code work removed from the migration note; deleted agent evidence paths dropped; no operational rerun)",
    "language": "agent:/root (en translation, label and retained-meaning self-review); agent:/root/min721_docs (en removal edit; agent review, not human acceptance)",
    "date": "2026-10-16"
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
