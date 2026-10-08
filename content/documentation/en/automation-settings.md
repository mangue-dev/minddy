---
{
  "id": "automation-settings",
  "locale": "en",
  "title": "Configure automatic issue work",
  "summary": "Separate account automation preferences from owner-only project rules.",
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
  "revision": 2,
  "sourceRevision": 2,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/settings/account-automations-section.tsx",
      "components/settings/smart-assign-section.tsx",
      "content/knowledge/settings-and-data.md",
      "content/documentation/reviews/remaining-account-capture-candidates.json",
      "lib/server/agent/quota.ts",
      "lib/server/usage.ts",
      "lib/server/agent/execute.ts"
    ]
  },
  "review": {
    "revision": 2,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "automation-settings-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/automation-settings-workflow.png",
      "alt": "Automation preset set to None.",
      "caption": "No preset is selected, so this account does not start automatic work.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    },
    {
      "id": "automation-settings-projects-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/automation-settings-projects-workflow.png",
      "alt": "Project selection for account automations.",
      "caption": "Project selection for account automations. Both demonstration projects are disabled here; no automation is started.",
      "revision": 2,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1800
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "automation-settings-workflow",
    "automation-settings-projects-workflow"
  ]
}
---

## Account automation choices {#automation-settings}
Open account settings' Automations section. Choose a preset, inspect its explanation and estimated usage, set the start delay and choose which effort sizes allow automatic steps. Estimates depend on the available allowance and are not fixed prices. Check the worker model in account AI settings before enabling code work. The same page lists automation switches for projects you own; members cannot enable another owner's project.

![Automation preset set to None.](/documentation/en/automation-settings-workflow.png)


## Distinguish the mechanisms {#mechanisms}
Smart Fill fills missing priority, effort, categories and objective; it does not choose status, assignee or due date. Account preferences distinguish filling on creation and eligible triage issues in projects you own. Automatic self-assignment on creation or start is a separate preference; start assignment only affects unassigned issues.

Smart Assign is a project owner setting with per-member rules. Smart Triage uses static project rules and is distinct from AI filling or code execution. Review each rule's intended recipients and trigger before saving.

Enable only the steps you want to run without another manual request. AI steps need a usable configured provider and must satisfy the usage checks that apply to that call. Compatible validated personal keys can exempt their calls from the account’s included-AI quota and move model billing to the provider. They do not make sandbox compute free; its cost is recorded separately, and a routine’s per-run budget remains a distinct limit. If unexpected work starts, inspect its issue activity and conversation, then disable the relevant account or project switch before creating more test issues.

![Project selection for account automations.](/documentation/en/automation-settings-projects-workflow.png)
