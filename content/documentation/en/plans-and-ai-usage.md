---
{
  "id": "plans-and-ai-usage",
  "locale": "en",
  "title": "Understand Cloud plans and AI consumption",
  "summary": "Check current capacity and distinguish included usage from provider and infrastructure charges.",
  "topic": "Account and apps",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A08"
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
      "content/knowledge/plans-and-billing.md",
      "app/(app)/billing/page.tsx",
      "app/(marketing)/pricing/page.tsx",
      "lib/billing-plans.ts",
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
  "related": [
    "ai-keys-and-models",
    "scheduled-routines"
  ],
  "aliases": [
    "plans-and-billing"
  ],
  "tags": [],
  "figures": [
    {
      "id": "plans-and-ai-usage-workflow",
      "kind": "screenshot",
      "src": "/documentation/en/plans-and-ai-usage-workflow.png",
      "alt": "AI usage page for the demonstration account.",
      "caption": "AI usage page for the demonstration account. The current budget, usage categories and history are read from the account; no purchase or paid run was triggered.",
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
    "plans-and-ai-usage-workflow"
  ]
}
---

## Compare the current account {#plans-and-ai-usage}
Cloud offers Free, Go and Pro. All include MCP, Numo conversations, contextual actions, code work and routines. Capacity, included AI, models and storage differ. Open Billing for your current allowance and usage, and compare the public pricing page before choosing a plan; the figures shown there are the current reference.

Use the offered checkout or subscription-management action for your account. Review the amount, billing period and provider confirmation before accepting. A successful plan change should appear in account billing; verify that rather than treating a closed checkout window as proof.

## What consumes budget {#consumption}

Included AI usage covers reasoning, Minddy tool calls, automation, worker model calls and server-sandbox compute. The monthly included-AI limit applies to work funded by Minddy. A routine’s per-run cap is a separate limit that can pause its execution; completed work stays in the conversation. These limits do not authorize automatic overage charges. Inspect the limit card and reset date when available.

Compatible personal keys bill model calls to their provider instead of included AI usage. A worker using a validated BYOK key bypasses the account’s plan quota and compute cap. Sandbox compute still has a real cost and is recorded in usage; recording that cost does not mean the monthly plan cap is applied to that BYOK run. Unassigned families or surfaces that use Minddy-funded calls remain subject to their Minddy allowance. Self-hosting has infrastructure and optional-provider costs determined by your installation; it does not become a Cloud subscription merely by running the same core.

## Candidate capacity reference {#plan-capacities}

These defaults describe the identified 0.11.1 candidate. Verify the live pricing page and account before purchasing; configured checkout prices and account overrides can differ. Guests exclude the project owner. Storage is charged to the owner of the project receiving files.

| Plan | Projects | Issues per project | Guests per project | Storage | Included monthly AI (USD) |
| --- | --- | --- | --- | --- | --- |
| Free | 2 | 300 | 3 | 1 GiB | 0.50 |
| Go | Unlimited | Unlimited | Unlimited | 20 GiB | 5 |
| Pro | Unlimited | Unlimited | Unlimited | 100 GiB | 15 |

![AI usage page for the demonstration account.](/documentation/en/plans-and-ai-usage-workflow.png)
